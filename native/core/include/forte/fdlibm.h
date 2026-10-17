// forte/fdlibm.h — Math.sin, cos, tan, exp, log, log1p, log2, log10, atan2 and pow as V8 computes
// them (fdlibm, as in V8's src/base/ieee754.cc: src/fdlibm.cpp), for a port that has to give the
// JavaScript's numbers to the last bit. The C libraries' functions differ from V8's in the last bit for 1 % (musl, in the
// WebAssembly) to 10 % (glibc) of arguments; the viola organista's friction can grow such a
// difference, in a key's tuning or in the treadle's sine taken every sample, into another attack.
#pragma once

namespace forte::fdlibm {

double sin(double x);
double cos(double x);
double tan(double x);
double exp(double x);
double log(double x);
double log1p(double x);
double log2(double x);
double log10(double x);
double atan(double x);
double atan2(double y, double x);
double pow(double x, double y);

} // namespace forte::fdlibm
