let xhrErrorMock = {
  open: jest.fn(),
  send: jest.fn(),
  setRequestHeader: jest.fn(),
  onload: jest.fn(),
  onerror: jest.fn(),
  ontimeout: jest.fn(),
  status: 400,
  statusText: "Bad Request",
};

(window as any).XMLHttpRequest = jest.fn(() => xhrErrorMock);

export default xhrErrorMock;
