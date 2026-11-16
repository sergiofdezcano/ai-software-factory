export type Notify = (message: string) => Promise<void>;

// Avisos al chat de Telegram del usuario, con el mismo bot que usa Hermes.
// Con threadId, al tema 🏭 Factory del grupo "Serg4Cano HQ"; si el tema ya no existe, sin tema.
// Enviar con sendMessage no interfiere con el long polling de Hermes.
// Un aviso que falla se registra y nunca interrumpe el pipeline.
export class TelegramNotifier {
  constructor(
    private token: string,
    private chatId: string,
    private fetchFn: typeof fetch = fetch,
    private log: (msg: string) => void = console.error,
    private threadId?: number,
  ) {}

  private post(body: object): Promise<Response> {
    return this.fetchFn(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async send(text: string): Promise<void> {
    try {
      const body = { chat_id: this.chatId, text, disable_web_page_preview: true };
      let r = await this.post(this.threadId ? { ...body, message_thread_id: this.threadId } : body);
      if (!r.ok && this.threadId && (await r.text()).includes('message thread not found')) {
        this.log(`Tema ${this.threadId} no encontrado; aviso sin tema`);
        r = await this.post(body);
      }
      if (!r.ok) this.log(`Aviso de Telegram rechazado (HTTP ${r.status})`);
    } catch (e) {
      this.log(`No se pudo enviar el aviso de Telegram: ${(e as Error).message}`);
    }
  }
}

export function notifierFromEnv(
  env: Record<string, string | undefined> = process.env,
  fetchFn: typeof fetch = fetch,
): TelegramNotifier | undefined {
  const token = env.FACTORY_TELEGRAM_BOT_TOKEN;
  const chat = env.FACTORY_TELEGRAM_CHAT_ID;
  const thread = Number(env.FACTORY_TELEGRAM_THREAD_ID) || undefined;
  return token && chat ? new TelegramNotifier(token, chat, fetchFn, console.error, thread) : undefined;
}
