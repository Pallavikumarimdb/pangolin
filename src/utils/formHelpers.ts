export function preventEnterSubmission(e: React.KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    
    // find the form and submit it properly
    const form = (e.target as HTMLElement).closest('form');
    if (form) {
      // then trigger form validation and submission
      const submitEvent = new Event('submit', { 
        bubbles: true, 
        cancelable: true 
      });
      form.dispatchEvent(submitEvent);
    }
  }
}

export function handleEnterKeySubmission(
  e: React.KeyboardEvent, 
  onSubmit: () => void
) {
  if (e.key === 'Enter') {
    e.preventDefault();
    onSubmit();
  }
}

// auto-save utility
export function createAutoSave<T>(
  data: T, 
  onSave: (data: T) => void, 
  delay: number = 2000
) {
  let timeoutId: NodeJS.Timeout;
  
  return () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      onSave(data);
    }, delay);
  };
}