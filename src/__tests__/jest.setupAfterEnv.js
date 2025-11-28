// Clean up after each test to prevent "Cannot log after tests are done" warnings
afterEach(() => {
  // Abort any pending XHR requests
  if (global.__activeXHRRequests) {
    global.__activeXHRRequests.forEach(xhr => {
      try {
        xhr.abort();
      } catch (e) {
        // Ignore abort errors
      }
    });
    global.__activeXHRRequests.clear();
  }
  
  // Clear localStorage to prevent cached events from being loaded
  if (global.__localStorageMock) {
    global.__localStorageMock.clear();
  }
});

