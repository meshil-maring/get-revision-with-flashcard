// Textbook blocks: definitions, theorems (and lemmas, propositions, corollaries), remarks,
// proofs, worked examples, exercises with hints and solutions, summaries and references.
// Each kind has its own look, so they are easy to tell apart while skimming a chapter.
import type { ReactNode } from 'react';

import { Spans } from '@/components/textbook/spans';
import type { EnvKind, Span } from '@/lib/rich-text';
import { ENV_LABELS, type ExamplePart, type TextbookNode } from '@/lib/textbook';

type EnvNode = Extract<TextbookNode, { kind: 'env' }>;
/** Draws a run of the chapter's parts (content.tsx's Nodes). */
type RenderNodes = (nodes: TextbookNode[]) => ReactNode;

const THEOREM_KINDS = new Set<EnvKind>(['theorem', 'lemma', 'proposition', 'corollary']);
/** Shown folded, to try first and open when needed. */
const FOLDED = new Set<EnvKind>(['hint', 'solution', 'answer']);

const hasText = (spans: Span[]) => spans.some((s) => s.math !== undefined || s.text.trim() !== '');

/** "Definition 1.2 — Derivative", with the kind's colour from CSS. */
function Label({ node, extra }: { node: EnvNode; extra?: ReactNode }) {
  return (
    <p className="tb-label">
      <span>
        {ENV_LABELS[node.env]}
        {node.number ? ` ${node.number}` : ''}
      </span>
      {hasText(node.title) ? (
        <span className="tb-label-title">
          — <Spans spans={node.title} />
        </span>
      ) : null}
      {extra}
    </p>
  );
}

export function EnvBlock({ node, renderNodes: render }: { node: EnvNode; renderNodes: RenderNodes }) {
  if (FOLDED.has(node.env)) return <Fold node={node} render={render} />;
  if (node.env === 'example') return <WorkedExample node={node} render={render} />;
  if (node.env === 'exercise') return <Exercise node={node} render={render} />;
  if (node.env === 'proof') return <Proof node={node} render={render} />;

  const kind = THEOREM_KINDS.has(node.env) ? 'theorem' : node.env;
  const Tag = node.env === 'summary' || node.env === 'remark' ? 'aside' : 'section';
  return (
    <Tag className={`tb-env tb-${kind}`} id={node.id} aria-label={`${ENV_LABELS[node.env]}${node.number ? ` ${node.number}` : ''}`}>
      <Label node={node} />
      <div className="tb-env-body">
        {render(node.children)}
      </div>
    </Tag>
  );
}

/** "Proof." in italics, the argument, and ∎ at the end. */
function Proof({ node, render }: { node: EnvNode; render: RenderNodes }) {
  return (
    <section className="tb-env tb-proof" id={node.id} aria-label="Proof">
      <span className="tb-label">
        Proof{hasText(node.title) ? (
          <>
            {' '}
            (<Spans spans={node.title} />)
          </>
        ) : null}
        .
      </span>
      <div className="tb-env-body">
        {render(node.children)}
      </div>
      <span className="tb-qed" aria-label="End of proof">
        ∎
      </span>
    </section>
  );
}

/** Hints, solutions and answers: folded until opened. */
function Fold({ node, render }: { node: EnvNode; render: RenderNodes }) {
  return (
    <details className={`tb-fold tb-fold-${node.env}`} id={node.id}>
      <summary>
        {ENV_LABELS[node.env]}
        {hasText(node.title) ? (
          <span>
            {' '}
            — <Spans spans={node.title} />
          </span>
        ) : null}
      </summary>
      <div className="tb-env-body">{node.parts ? <Parts parts={node.parts} render={render} /> : render(node.children)}</div>
    </details>
  );
}

/**
 * A worked example. When its paragraphs are labelled ("Question:", "Step 1:", "Final answer:"),
 * the question, the numbered steps and the boxed answer are each set apart.
 */
function WorkedExample({ node, render }: { node: EnvNode; render: RenderNodes }) {
  return (
    <section className="tb-env tb-example" id={node.id} aria-label={`Example ${node.number ?? ''}`.trim()}>
      <Label node={node} />
      <div className="tb-env-body">{node.parts ? <Parts parts={node.parts} render={render} /> : render(node.children)}</div>
    </section>
  );
}

function Parts({ parts, render }: { parts: ExamplePart[]; render: RenderNodes }) {
  // Steps next to each other form one numbered list.
  const groups: (ExamplePart | ExamplePart[])[] = [];
  for (const part of parts) {
    const last = groups[groups.length - 1];
    if (part.role === 'step' && Array.isArray(last)) last.push(part);
    else groups.push(part.role === 'step' ? [part] : part);
  }
  let stepCount = 0;
  return groups.map((group, i) => {
    if (Array.isArray(group)) {
      return (
        <ol className="tb-steps" key={i}>
          {group.map((step, j) => {
            stepCount++;
            const number = /\d+/.exec(step.label ?? '')?.[0] ?? String(stepCount);
            const [first, ...rest] = step.nodes;
            // "Step 1: Identify coefficients." — the sentence is the step's title.
            const titled = first?.kind === 'paragraph';
            return (
              <li className="tb-step" key={j}>
                <span className="tb-step-num" aria-hidden="true">
                  {number}
                </span>
                <span className="tb-sr">Step {number}. </span>
                {titled ? (
                  <p className="tb-step-title">
                    <Spans spans={first.spans} />
                  </p>
                ) : null}
                <div className="tb-step-body">
                  {render(titled ? rest : step.nodes)}
                </div>
              </li>
            );
          })}
        </ol>
      );
    }
    if (group.role === 'answer') {
      return (
        <div className="tb-part tb-answer" key={i} role="group" aria-label={group.label ?? 'Answer'}>
          <div className="tb-part-label">{group.label ?? 'Answer'}</div>
          <div className="tb-part-body">
            {render(group.nodes)}
          </div>
        </div>
      );
    }
    return (
      <div className={`tb-part${group.role === 'question' ? ' tb-question' : ''}`} key={i}>
        {group.label ? <div className="tb-part-label">{group.label}</div> : null}
        <div className="tb-part-body">
          {render(group.nodes)}
        </div>
      </div>
    );
  });
}

/** An exercise: numbered, with its difficulty; hints and solutions inside are folded. */
function Exercise({ node, render }: { node: EnvNode; render: RenderNodes }) {
  return (
    <section className="tb-env tb-exercise" id={node.id} aria-label={`Exercise ${node.number ?? ''}`.trim()}>
      <Label
        node={node}
        extra={node.difficulty ? <span className={`tb-level tb-level-${node.difficulty}`}>{node.difficulty}</span> : null}
      />
      <div className="tb-env-body">
        {render(node.children)}
      </div>
    </section>
  );
}
