import { CurrentUser } from "@main/model/user";
import { reactive, readonly } from "vue";

export const _me = reactive({
    userId: 0,
    isOnline: false,
    username: "Player",
    battleRoomState: {},
    outgoingFriendRequestUserIds: new Set<number>(),
    incomingFriendRequestUserIds: new Set<number>(),
    friendUserIds: new Set<number>(),
    ignoreUserIds: new Set<number>(),
    permissions: new Set<string>(),
    icons: {},
    clanId: null,
    countryCode: "",
    status: "offline",
} as CurrentUser);

async function login() {
    await window.account.login();
    _me.isOnline = true;
}

function playOffline() {
    _me.isOnline = false;
}

function logout() {
    _me.isOnline = false;
}

export const me = {
    ...readonly(_me),
    login,
    logout,
    playOffline,
};
