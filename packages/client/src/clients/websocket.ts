import { EventEmitter } from 'events';

export type RpcRequest = {
  jsonrpc?: string;
  id?: number;
  method: string;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  params?: any;
};

export type RpcResponse = {
  jsonrpc: string;
  id?: number;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  result?: any;
  error?: RpcError;
};

export type RpcError = {
  code: number;
  message: string;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  data?: any;
};

type PromiseCache = {
  resolve: (message: unknown) => void;
  reject: (reason: any) => void;
};

export class WebSocketClient extends EventEmitter {
  messageId: number;

  messageRequests: Map<number, PromiseCache>;

  websocket: WebSocket;

  connected: boolean;

  queue: RpcRequest[];

  constructor() {
    super();
    this.messageId = 0;
    this.messageRequests = new Map();
    this.connected = false;
    this.queue = [];
  }

  connect(url: string) {
    if (this.websocket) {
      this.websocket.close();
    }
    this.websocket = new WebSocket(url);
    this.websocket.onopen = (/* event */) => {
      this.connected = true;

      // Some routes make requests before the connection
      // has been established
      while (this.queue.length > 0) {
        const message = this.queue.shift();
        this.notify(message);
      }

      this.emit('open');
    };

    this.websocket.onclose = (/* event */) => {
      this.connected = false;
      this.emit('close');
    };

    this.websocket.onmessage = async (e) => {
      const msg = JSON.parse(e.data);

      // Got a promise to resolve
      if (msg.id > 0 && this.messageRequests.has(msg.id)) {
        const { resolve } = this.messageRequests.get(msg.id);
        resolve(msg);
        this.messageRequests.delete(msg.id);
        // Without an `id` we treat as a broadcast message
      } else if (msg.error) {
        throw new Error(msg.error.message);
      } else if (msg.result) {
        // Expects a tuple of (event, payload)
        if (Array.isArray(msg.result)) {
          const [event, payload] = msg.result;
          this.emit(event, payload);
        }
      }
    };
  }

  notify(message: RpcRequest): void {
    message.jsonrpc = '2.0';
    if (this.connected === false) {
      this.queue.push(message);
    } else {
      this.websocket.send(JSON.stringify(message));
    }
  }

  rpc(message: RpcRequest): Promise<any> {
    this.messageId += 1;
    const id = this.messageId;
    const p = new Promise((_resolve, reject) => {
      const resolve = (response: RpcResponse) => {
        if (response.error) {
          return reject(new Error(response.error.message));
        }
        return _resolve(response.result);
      };

      this.messageRequests.set(id, { resolve, reject });
    });
    message.id = id;
    this.notify(message);
    return p;
  }
}
