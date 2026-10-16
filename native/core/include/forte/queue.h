// queue.h — a lock-free single-producer, single-consumer ring of fixed capacity: how the audio
// thread and the others hand each other things without waiting.
#pragma once

#include <atomic>
#include <cstddef>
#include <vector>

namespace forte {

template <class T>
class SpscQueue {
 public:
  explicit SpscQueue(size_t capacity) : buf(capacity + 1) {}
  // false if full (the item is dropped)
  bool push(const T &x) {
    const size_t w = write.load(std::memory_order_relaxed), next = (w + 1) % buf.size();
    if (next == read.load(std::memory_order_acquire)) return false;
    buf[w] = x;
    write.store(next, std::memory_order_release);
    return true;
  }
  bool pop(T &x) {
    const size_t r = read.load(std::memory_order_relaxed);
    if (r == write.load(std::memory_order_acquire)) return false;
    x = buf[r];
    read.store((r + 1) % buf.size(), std::memory_order_release);
    return true;
  }
  bool empty() const { return read.load(std::memory_order_acquire) == write.load(std::memory_order_acquire); }

 private:
  std::vector<T> buf;
  std::atomic<size_t> read{0}, write{0};
};

} // namespace forte
