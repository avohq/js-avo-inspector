/// <reference types="jest" />
declare let xhrMock: {
    open: jest.Mock<any, any>;
    send: jest.Mock<any, any>;
    setRequestHeader: jest.Mock<any, any>;
    onload: jest.Mock<any, any>;
    onerror: jest.Mock<any, any>;
    ontimeout: jest.Mock<any, any>;
    status: number;
    response: string;
};
export default xhrMock;
