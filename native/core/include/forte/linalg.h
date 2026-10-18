// linalg.h — shared/linalg.js on Eigen: dense symmetric and generalized symmetric
// eigenproblems, for the models that reduce a structure to modes.
//
// Eigenvalues come out ascending, as in shared/linalg.js. An eigenvector's sign is arbitrary
// (Eigen's and linalg.js's tql2 may differ): a model must not depend on it.
#pragma once

#include <optional>

#include <Eigen/Dense>

namespace forte {

using Matrix = Eigen::MatrixXd;
using Vector = Eigen::VectorXd;

struct Eigen_ { Vector lambda; Matrix X; }; // X: column c is eigenvector c

// K x = λ x, K symmetric.
Eigen_ symEig(const Matrix &K);
// K x = λ M x, K symmetric, M symmetric positive definite; X is M-orthonormal (Xᵀ M X = I).
// Nothing if M is not positive definite (where linalg.js throws; the engines have no exceptions).
std::optional<Eigen_> genEig(const Matrix &K, const Matrix &M);
// M = L Lᵀ, L lower triangular; nothing as above.
std::optional<Matrix> cholesky(const Matrix &M);

} // namespace forte
