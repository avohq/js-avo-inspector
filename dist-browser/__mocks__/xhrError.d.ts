declare let xhrErrorMock: {
    open: jest.Mock<any, any, any>;
    send: jest.Mock<any, any, any>;
    setRequestHeader: jest.Mock<any, any, any>;
    onload: jest.Mock<any, any, any>;
    onerror: jest.Mock<any, any, any>;
    ontimeout: jest.Mock<any, any, any>;
    status: number;
    statusText: string;
};
export default xhrErrorMock;
