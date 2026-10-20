export type FormulaBoardItem = {
  id: string;
  name: string;
  latex: string;
  plain: string;
  note?: string;
};

export type FormulaBoardSection = {
  id: string;
  title: string;
  items: FormulaBoardItem[];
};

/** Curated common formulas for one-click copy (LaTeX or plain). */
export const FORMULA_BOARD: FormulaBoardSection[] = [
  {
    id: "physics",
    title: "AP Physics",
    items: [
      {
        id: "p-newton",
        name: "Newton’s 2nd law",
        latex: "F_{\\mathrm{net}} = ma",
        plain: "F_net = ma",
      },
      {
        id: "p-kinematic",
        name: "Kinematics (no t)",
        latex: "v^2 = v_0^2 + 2a\\Delta x",
        plain: "v² = v₀² + 2aΔx",
      },
      {
        id: "p-kinematic-t",
        name: "Kinematics (with t)",
        latex: "x = x_0 + v_0 t + \\tfrac{1}{2}at^2",
        plain: "x = x₀ + v₀t + ½at²",
      },
      {
        id: "p-momentum",
        name: "Momentum",
        latex: "p = mv",
        plain: "p = mv",
      },
      {
        id: "p-impulse",
        name: "Impulse–momentum",
        latex: "J = F\\Delta t = \\Delta p",
        plain: "J = FΔt = Δp",
      },
      {
        id: "p-ke",
        name: "Kinetic energy",
        latex: "K = \\tfrac{1}{2}mv^2",
        plain: "K = ½mv²",
      },
      {
        id: "p-pe",
        name: "Gravitational PE",
        latex: "U_g = mgh",
        plain: "U_g = mgh",
      },
      {
        id: "p-work",
        name: "Work",
        latex: "W = F\\cdot d\\cos\\theta",
        plain: "W = Fd cosθ",
      },
      {
        id: "p-ohm",
        name: "Ohm’s law",
        latex: "V = IR",
        plain: "V = IR",
      },
      {
        id: "p-power",
        name: "Electric power",
        latex: "P = IV = I^2R = \\frac{V^2}{R}",
        plain: "P = IV = I²R = V²/R",
      },
      {
        id: "p-centrip",
        name: "Centripetal accel.",
        latex: "a_c = \\frac{v^2}{r}",
        plain: "a_c = v²/r",
      },
      {
        id: "p-period",
        name: "Circular period",
        latex: "T = \\frac{2\\pi r}{v}",
        plain: "T = 2πr/v",
      },
    ],
  },
  {
    id: "calc",
    title: "AP Calculus",
    items: [
      {
        id: "c-power",
        name: "Power rule",
        latex: "\\frac{d}{dx}x^n = nx^{n-1}",
        plain: "d/dx x^n = n x^(n-1)",
      },
      {
        id: "c-product",
        name: "Product rule",
        latex: "(uv)' = u'v + uv'",
        plain: "(uv)' = u'v + uv'",
      },
      {
        id: "c-chain",
        name: "Chain rule",
        latex: "\\frac{dy}{dx} = \\frac{dy}{du}\\frac{du}{dx}",
        plain: "dy/dx = (dy/du)(du/dx)",
      },
      {
        id: "c-ftc",
        name: "FTC",
        latex: "\\frac{d}{dx}\\int_{a}^{x} f(t)\\,dt = f(x)",
        plain: "d/dx ∫_a^x f(t) dt = f(x)",
      },
      {
        id: "c-avg",
        name: "Average value",
        latex: "f_{\\mathrm{avg}} = \\frac{1}{b-a}\\int_{a}^{b} f(x)\\,dx",
        plain: "f_avg = 1/(b-a) ∫_a^b f(x) dx",
      },
      {
        id: "c-exp",
        name: "Exponential derivative",
        latex: "\\frac{d}{dx}e^{kx} = ke^{kx}",
        plain: "d/dx e^(kx) = k e^(kx)",
      },
    ],
  },
  {
    id: "chem",
    title: "AP Chemistry",
    items: [
      {
        id: "ch-ideal",
        name: "Ideal gas",
        latex: "PV = nRT",
        plain: "PV = nRT",
      },
      {
        id: "ch-molarity",
        name: "Molarity",
        latex: "M = \\frac{n}{V}",
        plain: "M = n/V",
      },
      {
        id: "ch-ph",
        name: "pH",
        latex: "\\mathrm{pH} = -\\log[\\mathrm{H}^+]",
        plain: "pH = -log[H+]",
      },
      {
        id: "ch-dilution",
        name: "Dilution",
        latex: "M_1V_1 = M_2V_2",
        plain: "M1V1 = M2V2",
      },
      {
        id: "ch-rate",
        name: "Rate law (general)",
        latex: "\\mathrm{rate} = k[A]^m[B]^n",
        plain: "rate = k[A]^m[B]^n",
      },
      {
        id: "ch-gibbs",
        name: "Gibbs free energy",
        latex: "\\Delta G = \\Delta H - T\\Delta S",
        plain: "ΔG = ΔH − TΔS",
      },
    ],
  },
  {
    id: "stats",
    title: "AP Statistics",
    items: [
      {
        id: "s-z",
        name: "z-score",
        latex: "z = \\frac{x-\\mu}{\\sigma}",
        plain: "z = (x − μ)/σ",
      },
      {
        id: "s-mean",
        name: "Sample mean SE",
        latex: "\\mathrm{SE}_{\\bar{x}} = \\frac{s}{\\sqrt{n}}",
        plain: "SE_x̄ = s/√n",
      },
      {
        id: "s-prop",
        name: "Sample proportion SE",
        latex: "\\mathrm{SE}_{\\hat{p}} = \\sqrt{\\frac{\\hat{p}(1-\\hat{p})}{n}}",
        plain: "SE_p̂ = √[p̂(1−p̂)/n]",
      },
      {
        id: "s-ci",
        name: "CI (rough form)",
        latex: "\\mathrm{estimate} \\pm z^*\\cdot\\mathrm{SE}",
        plain: "estimate ± z* · SE",
      },
    ],
  },
  {
    id: "math",
    title: "Algebra / precalc",
    items: [
      {
        id: "m-quad",
        name: "Quadratic formula",
        latex: "x = \\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}",
        plain: "x = (−b ± √(b²−4ac)) / (2a)",
      },
      {
        id: "m-dist",
        name: "Distance",
        latex: "d = \\sqrt{(x_2-x_1)^2+(y_2-y_1)^2}",
        plain: "d = √[(x₂−x₁)²+(y₂−y₁)²]",
      },
      {
        id: "m-slope",
        name: "Slope",
        latex: "m = \\frac{y_2-y_1}{x_2-x_1}",
        plain: "m = (y₂−y₁)/(x₂−x₁)",
      },
      {
        id: "m-exp",
        name: "Exponential growth",
        latex: "A = A_0 e^{kt}",
        plain: "A = A₀ e^(kt)",
      },
    ],
  },
];
