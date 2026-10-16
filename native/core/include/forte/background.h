// background.h — work too slow for the audio thread (rebuilding a model, a key's modes) done on
// a worker thread and handed back without locks: the plugins' version of a page computing
// noteData and posting it (docs/PLUGINS.md, step 2).
//
//   KeyData<T> data(build);          // build(key, version) → std::unique_ptr<T>, on the worker
//   data.prepare(version, lo, hi);   // any thread: build every key for these parameters, nearest first
//   auto d = data.get(key, version);  // the audio thread: d.data is the key's data, or null (asked for)
//   data.audioCycle();               // the audio thread, after each process call
//
// The audio thread never waits, never allocates and never frees: retired data is freed on the
// worker once no voice holds it (acquire/release) and the audio thread has finished a block
// since it was replaced. Without threads (WebAssembly), get() builds in place.
#pragma once

#include <atomic>
#include <condition_variable>
#include <cstdint>
#include <functional>
#include <memory>
#include <mutex>
#include <thread>
#include <vector>

#include "forte/queue.h"

namespace forte {

#if defined(__EMSCRIPTEN__) && !defined(__EMSCRIPTEN_PTHREADS__)
#define FORTE_THREADS 0
#else
#define FORTE_THREADS 1
#endif

template <class T>
class KeyData {
 public:
  using Build = std::function<std::unique_ptr<T>(int key, uint64_t version)>;
  explicit KeyData(Build build) : build(std::move(build)), requests(512) {
    for (auto &s : slots) s.store(nullptr);
#if FORTE_THREADS
    worker = std::thread([this] { run(); });
#endif
  }
  ~KeyData() {
#if FORTE_THREADS
    { std::lock_guard<std::mutex> l(m); quit = true; }
    cv.notify_one();
    worker.join();
#endif
    for (auto &s : slots) delete s.load();
    for (Entry *e : retired) delete e;
  }
  KeyData(const KeyData &) = delete;
  KeyData &operator=(const KeyData &) = delete;

  // Build every key in [lo, hi] for `version`, the ones nearest `focus` first.
  void prepare(uint64_t version, int lo, int hi, int focus = 60) {
    std::lock_guard<std::mutex> l(m);
    wanted = version; order.clear();
    for (int d = 0; d <= hi - lo; d++) for (int k : {focus - d, focus + d}) if (k >= lo && k <= hi && (d || k == focus)) order.push_back(k);
    cv.notify_one();
  }

  struct Entry;
  struct Ref {
    const T *data = nullptr;
    Entry *entry = nullptr;
    explicit operator bool() const { return data != nullptr; }
  };
  // The audio thread: the key's data for `version`, or none (then it is asked for).
  Ref get(int key, uint64_t version) {
    if (key < 0 || key > 127) return {};
    Entry *e = slots[key].load(std::memory_order_acquire);
    if (e && e->version == version) return {&e->data, e};
#if FORTE_THREADS
    requests.push({key, version});
    return {};
#else
    install(key, version); // no threads: build now
    e = slots[key].load();
    return e && e->version == version ? Ref{&e->data, e} : Ref{};
#endif
  }
  // A voice that keeps data past the block it got it in holds it: acquire, then release.
  void acquire(Ref r) { if (r.entry) r.entry->holds.fetch_add(1, std::memory_order_relaxed); }
  void release(Ref r) { if (r.entry) r.entry->holds.fetch_sub(1, std::memory_order_release); }
  // The audio thread, after each block.
  void audioCycle() { cycles.fetch_add(1, std::memory_order_release); }

  struct Entry {
    uint64_t version;
    T data;
    std::atomic<int> holds{0};
    uint64_t retiredAt = 0;
  };

 private:
  struct Request { int key; uint64_t version; };

  void install(int key, uint64_t version) {
    std::unique_ptr<T> d = build(key, version);
    if (!d) return;
    Entry *e = new Entry{version, std::move(*d)};
    Entry *old = slots[key].exchange(e, std::memory_order_acq_rel);
    if (old) { old->retiredAt = cycles.load(std::memory_order_acquire); retired.push_back(old); }
  }
  // free what no voice holds and the audio thread can no longer be reading
  void collect() {
    const uint64_t now = cycles.load(std::memory_order_acquire);
    std::erase_if(retired, [&](Entry *e) {
      if (now < e->retiredAt + 2 || e->holds.load(std::memory_order_acquire) > 0) return false;
      delete e;
      return true;
    });
  }
#if FORTE_THREADS
  void run() {
    std::unique_lock<std::mutex> l(m);
    for (;;) {
      cv.wait_for(l, std::chrono::milliseconds(2), [&] { return quit || !order.empty() || !requests.empty(); });
      if (quit) return;
      Request r;
      int key = -1;
      uint64_t version = wanted;
      if (requests.pop(r)) { key = r.key; version = r.version; } // a note waiting: first
      else if (!order.empty()) { key = order.front(); order.erase(order.begin()); }
      if (key >= 0) {
        Entry *e = slots[key].load(std::memory_order_acquire);
        if (!e || e->version != version) { l.unlock(); install(key, version); l.lock(); }
      }
      collect();
    }
  }
  std::thread worker;
#endif
  Build build;
  std::atomic<Entry *> slots[128];
  SpscQueue<Request> requests;
  std::vector<Entry *> retired;
  std::vector<int> order;
  uint64_t wanted = 0;
  std::atomic<uint64_t> cycles{0};
  std::mutex m;
  std::condition_variable cv;
  bool quit = false;
};

} // namespace forte
