let xhrMock = {
  open: jest.fn(),
  send: jest.fn(),
  setRequestHeader: jest.fn(),
  onload: jest.fn(),
  onerror: jest.fn(),
  ontimeout: jest.fn(),
  status: 200,
  response: "{}",
};

(window as any).XMLHttpRequest = jest.fn(() => xhrMock);

export default xhrMock;
