export const isTextSelecting = (): boolean => {
  const selection = window.getSelection();
  return !!selection && selection.toString().length > 0;
};
