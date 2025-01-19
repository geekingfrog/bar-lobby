import { CONFIG_PATH } from "@main/config/app";
import { FileStore } from "@main/json/file-store";
import { accountSchema } from "@main/json/model/account";
import { RedirectHandler } from "@main/services/oauth.service";
import { logger } from "@main/utils/logger";
import { createHash, randomInt } from "crypto";

import { ipcMain, shell } from "electron";
import path from "path";
import { stringify } from "querystring";

const log = logger("account-service");

const accountStore = new FileStore<typeof accountSchema>(path.join(CONFIG_PATH, "account.json"), accountSchema);

function init() {
    accountStore.init();
}

function getAccount() {
    return accountStore.model;
}

async function updateAccount(data: Partial<typeof accountSchema>) {
    await accountStore.update(data);
}

function openInBrowser(url: string) {
    shell.openExternal(url);
}

function createUrlWithQuerystring(baseUrl: string, params: Record<string, string | number | boolean>): string {
    const queryString = stringify(params);
    return `${baseUrl}?${queryString}`;
}

function generatePKCE(): [string, string] {
    /**
     * generates a (crypto strong) random challenge and the associated
     * verifier for pkce. All encoding is already done
     * See: https://datatracker.ietf.org/doc/html/rfc7636
     * and: https://www.oauth.com/playground/authorization-code-with-pkce.html
     */
    const charSpace = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    const len = 47; // must be between 43 and 128

    const buf = Buffer.alloc(len);

    for (let i = 0; i < buf.length; i++) {
        const idx = randomInt(0, charSpace.length);
        buf.write(charSpace.charAt(idx), i);
    }

    const hash = createHash("sha256");
    hash.update(buf);
    const challenge = hash.digest("base64url");
    return [buf.toString(), challenge];
}

function registerIpcHandlers() {
    ipcMain.handle("account:get", async () => {
        return getAccount();
    });
    ipcMain.handle("account:update", async (_event, data: Partial<typeof accountSchema>) => {
        return updateAccount(data);
    });
    ipcMain.handle("account:login", async () => {
        const response = await fetch("https://server5.beyondallreason.info/.well-known/oauth-authorization-server");
        const { authorization_endpoint, token_endpoint } = await response.json();

        const fixedAuthorizationEndpoint = authorization_endpoint.replaceAll(":8888", "");
        const fixedTokenEndpoint = token_endpoint.replaceAll(":8888", "");

        const [codeVerifier, codeChallenge] = generatePKCE();

        let handler: RedirectHandler;
        try {
            handler = new RedirectHandler();
            const redirectUrl = await handler.getRedirectUrl();
            const url = createUrlWithQuerystring(fixedAuthorizationEndpoint, {
                client_id: "generic_lobby",
                response_type: "code",
                redirect_uri: redirectUrl,
                code_challenge: codeChallenge,
                code_challenge_method: "S256",
            });
            openInBrowser(url);
            const callbackUrl = await handler.waitForCallback();
            log.info(`Received callback URL: ${callbackUrl}`);
            const code = callbackUrl.searchParams.get("code");
            log.info(`Received OAuth2 code: ${code}`);

            const tokenUrl = createUrlWithQuerystring(fixedTokenEndpoint, {
                grant_type: "authorization_code",
                client_id: "generic_lobby",
                code,
                code_verifier: codeVerifier,
                redirect_uri: redirectUrl,
            });

            const tokenResponse = await fetch(tokenUrl, {
                method: "POST",
            });
            log.info(`Token response: ${tokenResponse.status} ${tokenResponse.statusText}`);

            const token = await tokenResponse.json();
            log.info(`Token: ${JSON.stringify(token)}`);

            // curl -iv https://tachyon.geekingfrog.com:4567/oauth/token \
            // --data-urlencode "grant_type=authorization_code" \
            // --data-urlencode "client_id=generic_lobby" \
            // --data-urlencode "code=60PKPAAVGIL8L6MCSVQK90V1GLORV22PQI6H13PIGQL21E0HFAF0====" \
            // --data-urlencode "code_verifier=2ENOENOGA0USUNPROMSUD9U64P604R2LVOVDG5SEL7EIGA5SL3TC2BQN0MJVVG8S" \
            // --data-urlencode "redirect_uri=http://localhost/oauth2callback" \
        } catch (error) {
            log.error("Error during login:", error);
        } finally {
            handler?.close();
        }
    });
    ipcMain.handle("oauth2:code", async (_event, code: string) => {
        log.info(`Received OAuth2 code: ${code}`);
    });
}

export type Account = typeof accountStore.model;
export const accountService = {
    init,
    registerIpcHandlers,
    getAccount,
    updateAccount,
};
