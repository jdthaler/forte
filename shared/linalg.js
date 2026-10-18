// linalg.js — dense symmetric (generalized) eigenproblems: for the tools that design structures
// (the bells' FEM), the tests' independent checks, and the C++'s vectors (tools/gen-native-vectors.mjs).

// Dense linear algebra (symmetric generalized eigenproblem K x = λ M x)

function cholesky(M, n) {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = M[i * n + j];
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      if (i === j) {
        if (s <= 0) throw new Error('mass matrix not positive definite');
        L[i * n + i] = Math.sqrt(s);
      } else L[i * n + j] = s / L[j * n + j];
    }
  }
  return L;
}

// In place: B ← L⁻¹ B (B is n×n row-major).
function forwardSubst(L, B, n) {
  for (let i = 0; i < n; i++) {
    const ri = i * n;
    for (let j = 0; j < i; j++) {
      const l = L[ri + j];
      if (l === 0) continue;
      const rj = j * n;
      for (let c = 0; c < n; c++) B[ri + c] -= l * B[rj + c];
    }
    const d = 1 / L[ri + i];
    for (let c = 0; c < n; c++) B[ri + c] *= d;
  }
}

// Householder tridiagonalization + implicit QL (after JAMA / EISPACK tred2, tql2).
// V: array of n row arrays, overwritten with eigenvectors (columns). Returns d.
export function symEig(V, n) {
  const d = new Float64Array(n), e = new Float64Array(n);
  for (let j = 0; j < n; j++) d[j] = V[n - 1][j];
  for (let i = n - 1; i > 0; i--) {
    let scale = 0, h = 0;
    for (let k = 0; k < i; k++) scale += Math.abs(d[k]);
    if (scale === 0) {
      e[i] = d[i - 1];
      for (let j = 0; j < i; j++) { d[j] = V[i - 1][j]; V[i][j] = 0; V[j][i] = 0; }
    } else {
      for (let k = 0; k < i; k++) { d[k] /= scale; h += d[k] * d[k]; }
      let f = d[i - 1], g = Math.sqrt(h);
      if (f > 0) g = -g;
      e[i] = scale * g;
      h -= f * g;
      d[i - 1] = f - g;
      for (let j = 0; j < i; j++) e[j] = 0;
      for (let j = 0; j < i; j++) {
        f = d[j];
        V[j][i] = f;
        g = e[j] + V[j][j] * f;
        for (let k = j + 1; k <= i - 1; k++) { g += V[k][j] * d[k]; e[k] += V[k][j] * f; }
        e[j] = g;
      }
      f = 0;
      for (let j = 0; j < i; j++) { e[j] /= h; f += e[j] * d[j]; }
      const hh = f / (h + h);
      for (let j = 0; j < i; j++) e[j] -= hh * d[j];
      for (let j = 0; j < i; j++) {
        f = d[j]; g = e[j];
        for (let k = j; k <= i - 1; k++) V[k][j] -= f * e[k] + g * d[k];
        d[j] = V[i - 1][j];
        V[i][j] = 0;
      }
    }
    d[i] = h;
  }
  for (let i = 0; i < n - 1; i++) {
    V[n - 1][i] = V[i][i];
    V[i][i] = 1;
    const h = d[i + 1];
    if (h !== 0) {
      for (let k = 0; k <= i; k++) d[k] = V[k][i + 1] / h;
      for (let j = 0; j <= i; j++) {
        let g = 0;
        for (let k = 0; k <= i; k++) g += V[k][i + 1] * V[k][j];
        for (let k = 0; k <= i; k++) V[k][j] -= g * d[k];
      }
    }
    for (let k = 0; k <= i; k++) V[k][i + 1] = 0;
  }
  for (let j = 0; j < n; j++) { d[j] = V[n - 1][j]; V[n - 1][j] = 0; }
  V[n - 1][n - 1] = 1;
  e[0] = 0;

  for (let i = 1; i < n; i++) e[i - 1] = e[i];
  e[n - 1] = 0;
  let f = 0, tst1 = 0;
  const eps = 2 ** -52;
  for (let l = 0; l < n; l++) {
    tst1 = Math.max(tst1, Math.abs(d[l]) + Math.abs(e[l]));
    let m = l;
    while (m < n) { if (Math.abs(e[m]) <= eps * tst1) break; m++; }
    if (m > l) {
      let iter = 0;
      do {
        if (++iter > 60) throw new Error('tql2 did not converge');
        let g = d[l];
        let p = (d[l + 1] - g) / (2 * e[l]);
        let r = Math.hypot(p, 1);
        if (p < 0) r = -r;
        d[l] = e[l] / (p + r);
        d[l + 1] = e[l] * (p + r);
        const dl1 = d[l + 1];
        let h = g - d[l];
        for (let i = l + 2; i < n; i++) d[i] -= h;
        f += h;
        p = d[m];
        let c = 1, c2 = 1, c3 = 1, s = 0, s2 = 0;
        const el1 = e[l + 1];
        for (let i = m - 1; i >= l; i--) {
          c3 = c2; c2 = c; s2 = s;
          g = c * e[i];
          h = c * p;
          r = Math.hypot(p, e[i]);
          e[i + 1] = s * r;
          s = e[i] / r;
          c = p / r;
          p = c * d[i] - s * g;
          d[i + 1] = h + s * (c * g + s * d[i]);
          for (let k = 0; k < n; k++) {
            const Vk = V[k];
            h = Vk[i + 1];
            Vk[i + 1] = s * Vk[i] + c * h;
            Vk[i] = c * Vk[i] - s * h;
          }
        }
        p = (-s * s2 * c3 * el1 * e[l]) / dl1;
        e[l] = s * p;
        d[l] = c * p;
      } while (Math.abs(e[l]) > eps * tst1);
    }
    d[l] += f;
    e[l] = 0;
  }
  for (let i = 0; i < n - 1; i++) {
    let k = i, p = d[i];
    for (let j = i + 1; j < n; j++) if (d[j] < p) { k = j; p = d[j]; }
    if (k !== i) {
      d[k] = d[i]; d[i] = p;
      for (let j = 0; j < n; j++) { const t = V[j][i]; V[j][i] = V[j][k]; V[j][k] = t; }
    }
  }
  return d;
}

// Solve K x = λ M x. Returns ascending λ and the first `nVec` M-orthonormal
// eigenvectors as X (row-major n × nVec, column c = eigenvector c).
export function genEig(K, M, n, nVec = n) {
  const L = cholesky(M, n);
  const Y = Float64Array.from(K);
  forwardSubst(L, Y, n); // Y = L⁻¹ K
  const Z = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) Z[i * n + j] = Y[j * n + i];
  forwardSubst(L, Z, n); // Z = L⁻¹ K L⁻ᵀ
  const V = [];
  for (let i = 0; i < n; i++) {
    const row = new Float64Array(n);
    for (let j = 0; j < n; j++) row[j] = 0.5 * (Z[i * n + j] + Z[j * n + i]);
    V.push(row);
  }
  const lambda = symEig(V, n);
  // X = L⁻ᵀ V (back substitution), only the needed columns.
  const X = new Float64Array(n * nVec);
  for (let i = n - 1; i >= 0; i--) {
    const xi = i * nVec;
    for (let c = 0; c < nVec; c++) X[xi + c] = V[i][c];
    for (let j = i + 1; j < n; j++) {
      const l = L[j * n + i];
      if (l === 0) continue;
      const xj = j * nVec;
      for (let c = 0; c < nVec; c++) X[xi + c] -= l * X[xj + c];
    }
    const dI = 1 / L[i * n + i];
    for (let c = 0; c < nVec; c++) X[xi + c] *= dI;
  }
  return { lambda, X };
}

