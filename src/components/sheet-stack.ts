/**
 * One bottom sheet at a time, across components that do not know about each
 * other.
 *
 * THE COLLISION IS REAL AND NEITHER SIDE CAN SEE IT. A stage sheet lives at the
 * foot of the pipeline and sits at its peek height whether or not anybody has
 * touched it; the settings sheet is opened from the account menu, three
 * components away, and arrives from the same edge. Nothing connected them, so
 * two surfaces stacked on the bottom of the screen — the settings sheet over a
 * strip of the stage sheet still showing beneath it, each with its own rounded
 * top, reading as one sheet that had been torn.
 *
 * Z-INDEX WAS NOT THE ANSWER. The layers were already right: the modal covers
 * the stage sheet. What was wrong is that the covered one was still OPEN —
 * still holding its content, still lifting the page behind it, and still there
 * when the modal closed, in a state the reader never asked for.
 *
 * A registry rather than a context, because these two share no ancestor worth
 * threading state through, and because the rule is about the whole screen
 * rather than about a subtree. Each sheet says how to close itself; claiming
 * closes whoever holds the floor.
 */

type Close = () => void;

const closers = new Map<string, Close>();
let holder: string | null = null;

/** Tell the registry how to close this sheet. Returns the unregister. */
export function registerSheet(id: string, close: Close): () => void {
  closers.set(id, close);
  return () => {
    closers.delete(id);
    if (holder === id) holder = null;
  };
}

/** Take the floor, closing whoever had it. */
export function claimSheet(id: string): void {
  if (holder === id) return;
  if (holder !== null) closers.get(holder)?.();
  holder = id;
}

/** Give up the floor, but only if it is still ours — a sheet closed BY a claim
 *  must not clear the holder the claimer just set. */
export function releaseSheet(id: string): void {
  if (holder === id) holder = null;
}
