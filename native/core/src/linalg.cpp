// linalg.cpp — eigenproblems on Eigen (linalg.h).

#include "forte/linalg.h"

namespace forte {

Eigen_ symEig(const Matrix &K) {
  Eigen::SelfAdjointEigenSolver<Matrix> s(K);
  return {s.eigenvalues(), s.eigenvectors()};
}

std::optional<Matrix> cholesky(const Matrix &M) {
  Eigen::LLT<Matrix> llt(M);
  if (llt.info() != Eigen::Success) return std::nullopt;
  return Matrix(llt.matrixL());
}

std::optional<Eigen_> genEig(const Matrix &K, const Matrix &M) {
  if (Eigen::LLT<Matrix>(M).info() != Eigen::Success) return std::nullopt;
  Eigen::GeneralizedSelfAdjointEigenSolver<Matrix> s(K, M, Eigen::ComputeEigenvectors | Eigen::Ax_lBx);
  if (s.info() != Eigen::Success) return std::nullopt;
  return Eigen_{s.eigenvalues(), s.eigenvectors()};
}

} // namespace forte
