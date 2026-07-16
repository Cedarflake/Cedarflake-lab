interface ChromeDebuggee {
  tabId: number
}

interface ChromeMessageSender {
  id?: string
  tab?: {
    id?: number
  }
  url?: string
}

interface ChromeApi {
  debugger: {
    attach(target: ChromeDebuggee, requiredVersion: string): Promise<void>
    detach(target: ChromeDebuggee): Promise<void>
    sendCommand(
      target: ChromeDebuggee,
      method: string,
      commandParams?: object,
    ): Promise<unknown>
  }
  runtime: {
    id: string
    onMessage: {
      addListener(
        listener: (
          message: unknown,
          sender: ChromeMessageSender,
          sendResponse: (response: unknown) => void,
        ) => boolean | void,
      ): void
    }
    sendMessage(message: unknown): Promise<unknown>
  }
}

declare const chrome: ChromeApi
