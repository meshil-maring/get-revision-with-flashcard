// A full chapter in the note format, using everything the textbook reader can show. Used by the
// tests and for checking the reader by eye (it is also a good example to give an AI app).
export const SAMPLE_CHAPTER = String.raw`The derivative measures how a quantity changes. In this chapter we define it with limits, prove the rules that make it easy to compute, and use it to solve problems.

## The derivative

:::definition Derivative
Let $f$ be a function defined near $a$. The **derivative** of $f$ at $a$ is
$$f'(a)=\lim_{h\to 0}\frac{f(a+h)-f(a)}{h}$$
when this limit exists.
:::

Geometrically, $f'(a)$ is the slope of the tangent line to $y=f(x)$ at the point $(a, f(a))$. The tangent line is
$$y = f(a) + f'(a)(x-a).$$

### Notation

Leibniz wrote $\dfrac{dy}{dx}$, Lagrange $f'(x)$ and Newton $\dot{y}$. For partial derivatives we write $\dfrac{\partial f}{\partial x}$.

:::theorem Power rule
For every real number $n$,
$$\frac{d}{dx}x^{n} = n\,x^{n-1}.$$
:::

:::proof
For a positive integer $n$, expand $(x+h)^n$ with the binomial theorem; every term after the second contains $h^2$, so dividing by $h$ and letting $h\to0$ leaves $n x^{n-1}$.
:::

## Worked examples

:::example Solving a quadratic equation
Question:
$$2x^2-5x+2=0$$
Step 1: Identify coefficients.
$$a=2,\quad b=-5,\quad c=2$$
Step 2: Apply the quadratic formula.
$$x=\frac{5\pm\sqrt{25-16}}{4}$$
Step 3: Simplify.
$$x=\frac{5\pm3}{4}$$
Final answer:
$$\boxed{x=2\quad\text{or}\quad x=\frac12}$$
:::

A long formula scrolls sideways inside its box instead of widening the page:
$$\sum_{k=0}^{\infty}\frac{f^{(k)}(a)}{k!}(x-a)^k = f(a)+f'(a)(x-a)+\frac{f''(a)}{2!}(x-a)^2+\frac{f'''(a)}{3!}(x-a)^3+\cdots$$

\begin{align}
\frac{d}{dx}\sin x &= \cos x \\
\frac{d}{dx}\cos x &= -\sin x
\end{align}

| Function | Derivative | Valid for |
|---|---|---|
| $x^n$ | $nx^{n-1}$ | $n \in \R$ |
| $e^x$ | $e^x$ | all $x$ |
| $\ln x$ | $\dfrac{1}{x}$ | $x>0$ |
| $|x|$ | $\dfrac{x}{|x|}$ | $x\neq0$ |

:::diagram The tangent line touches the curve at one point
<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg"><path d="M20 160 Q160 -40 300 160" fill="none" stroke="#1f3f8f" stroke-width="3"/><line x1="40" y1="70" x2="280" y2="70" stroke="#d64545" stroke-width="2"/><circle cx="160" cy="70" r="5" fill="#d64545"/><text x="168" y="62" font-size="14" fill="#333">(a, f(a))</text></svg>
:::

Piecewise functions and matrices are typeset too:
$$|x| = \begin{cases} x & x \ge 0 \\ -x & x < 0 \end{cases}\qquad \det\begin{pmatrix} a & b \\ c & d \end{pmatrix} = ad-bc$$

${'```'}python
def derivative(f, x, h=1e-6):
    return (f(x + h) - f(x - h)) / (2 * h)
${'```'}

:::exercise [easy] Using the power rule
1. Differentiate $f(x)=x^5$.
2. Find the slope of $y=\sqrt{x}$ at $x=4$.
:::hint
Write $\sqrt{x}=x^{1/2}$.
:::
:::solution
1. $f'(x)=5x^4$. 2. $\frac{1}{2\sqrt{4}}=\frac14$.
:::
:::

:::exercise [hard] A broken formula
This shows how a mistake in LaTeX looks: $\frac{1}{$.
:::

:::summary
- The derivative is a limit of difference quotients.
- The power rule gives $\frac{d}{dx}x^n=nx^{n-1}$.
- ==Practise== with the exercises before moving on.
:::

:::references
1. J. Stewart, *Calculus: Early Transcendentals*, 9th ed.
:::`;
