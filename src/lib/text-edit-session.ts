export interface ActiveTextEditState {
  elementId: string;
  draft: string;
  isComposing: boolean;
  selectAll: boolean;
}

export function shouldSelectTextOnFocus(input: { placeholder: boolean; text: string }): boolean {
  return Boolean(input.placeholder);
}

export function startTextEdit(
  elementId: string,
  draft: string,
  selectAll: boolean
): ActiveTextEditState {
  return {
    elementId,
    draft,
    isComposing: false,
    selectAll,
  };
}

export function updateComposition(
  session: ActiveTextEditState,
  isComposing: boolean
): ActiveTextEditState {
  return {
    ...session,
    isComposing,
  };
}

export function canCommitTextEdit(session: ActiveTextEditState): boolean {
  return !session.isComposing;
}
