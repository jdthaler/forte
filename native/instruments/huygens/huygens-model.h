// huygens-model.h — the Huygens keyboard's model in C++: what each key is designed to play
// (huygens/src/tuning.js) and the exact results for its pulse coupling (sync-theory.js), operation
// for operation. Exponentials, logarithms and powers go through V8's fdlibm (forte/fdlibm.h), so
// a key's pitch and the moment a kick fires a lamp are the JavaScript's to the last bit.
#pragma once

#include <cstdint>

namespace forte::huygens {

constexpr int KEY_LO = 36, KEY_HI = 96;

// Math.log2 as V8 computes it (src/base/ieee754.cc: FreeBSD's e_log2.c), which forte/fdlibm.h
// doesn't have: the pitch servo takes it of every sounding key, every block.
double log2(double x);

// 440 · 2^((m − 69)/12)
double keyFreq(double m);
// deterministic per-key number in [−1, 1] (the random mistuning)
double keyNoise(int m);
// each key's design frequency: equal temperament, or 5-limit just above a tonic (tuning: 0 or 1),
// each key off by mistune · keyNoise cents
double tunedFreq(int m, int tuning, int tonic, double mistune);

// δ, the fraction of a period within which a kick (a fraction of the lamp's swing V_s − V_e)
// captures a lamp: ln[(S − V_s + K)/(S − V_s)] / ln[(S − V_e)/(S − V_s)]
double deltaOf(double kick, double vNom, double vStrike, double vExt);

// Two lamps that have just fired together, the low one with period 1, the high one with period
// 1/r: how many times each fires until they next fire together (the lock p:q, high : low).
// False if no shared firing comes within maxFirings.
struct Lock { int p = 0, q = 0; };
bool lockRatio(double r, double delta, Lock &out, int maxFirings = 100000);

} // namespace forte::huygens
