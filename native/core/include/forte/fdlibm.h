// forte/fdlibm.h — Math.sin, cos, tan, exp, expm1, log, log1p, log2, log10, atan2, pow and tanh as
// V8 computes them (fdlibm, as in V8's src/base/ieee754.cc: src/fdlibm.cpp), and Math.hypot of two
// numbers as V8's builtin (Kahan's compensated sum), for numbers that are the same to the last
// bit in the WebAssembly and every plugin. The C libraries' functions differ from V8's in the last bit for 1 % (musl, in the
// WebAssembly) to 10 % (glibc) of arguments; the viola organista's friction can grow such a
// difference, in a key's tuning or in the treadle's sine taken every sample, into another attack.
#pragma once

namespace forte::fdlibm {

double sin(double x);
double cos(double x);
double tan(double x);
double exp(double x);
double expm1(double x);
double log(double x);
double log1p(double x);
double log2(double x);
double log10(double x);
double atan(double x);
double atan2(double y, double x);
double pow(double x, double y);
double tanh(double x);
double hypot(double x, double y);

} // namespace forte::fdlibm
