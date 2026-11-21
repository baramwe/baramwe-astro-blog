type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {
    /** /private/golf, /api/golf 요청에서만 미들웨어가 채운다 */
    golf?: import("./lib/golf/member").GolfContext;
  }
}
