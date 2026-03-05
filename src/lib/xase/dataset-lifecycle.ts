// Stub for backward compatibility after Sprint 1 cleanup
export async function transitionState(datasetId: string, newState: string) {
  console.warn('Dataset lifecycle transition stubbed');
  return { success: true };
}

export async function validateTransition(currentState: string, newState: string) {
  console.warn('Lifecycle validation stubbed');
  return true;
}

export async function publishDataset(datasetId: string) {
  console.warn('Dataset publish stubbed');
  return { success: true, publishedAt: new Date() };
}
