// BLOQ Game Center bridge for Capacitor (Build 4). NOT YET VERIFIED ON A DEVICE.
//
// Setup (once the Xcode project exists via `npx cap add ios`):
//   1. Copy this file into ios/App/App/ and add it to the App target.
//   2. Enable the Game Center capability on the App target.
//   3. In App Store Connect create the leaderboards listed in src/platform/gameCenter.ts (LEADERBOARDS):
//      bloq.classic.score.r2, bloq.classic.level.r2, bloq.chain.largest (classic, best score kept), and
//      bloq.daily.score as a *recurring* leaderboard that resets every 24 hours at 00:00 UTC.
//   4. Register the plugin: in a custom bridge view controller,
//      override func capacitorDidLoad() { bridge?.registerPluginInstance(GameCenterPlugin()) }

import Capacitor
import GameKit

@objc(GameCenterPlugin)
public class GameCenterPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GameCenterPlugin"
    public let jsName = "GameCenter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadEntries", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showDashboard", returnType: CAPPluginReturnPromise),
    ]

    @objc func authenticate(_ call: CAPPluginCall) {
        let local = GKLocalPlayer.local
        if local.isAuthenticated {
            call.resolve(["authenticated": true, "name": local.displayName])
            return
        }
        var answered = false
        local.authenticateHandler = { [weak self] viewController, error in
            if let vc = viewController {
                // Game Center wants to show its sign-in sheet. It is optional: the player can dismiss it.
                DispatchQueue.main.async { self?.bridge?.viewController?.present(vc, animated: true) }
                return
            }
            guard !answered else { return }
            answered = true
            if error != nil || !local.isAuthenticated {
                call.resolve(["authenticated": false])
            } else {
                call.resolve(["authenticated": true, "name": local.displayName])
            }
        }
    }

    @objc func submitScore(_ call: CAPPluginCall) {
        guard let id = call.getString("leaderboardId"), let score = call.getInt("score") else {
            call.reject("leaderboardId and score are required"); return
        }
        guard GKLocalPlayer.local.isAuthenticated else { call.reject("not authenticated"); return }
        GKLeaderboard.submitScore(score, context: 0, player: GKLocalPlayer.local, leaderboardIDs: [id]) { error in
            if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
        }
    }

    @objc func loadEntries(_ call: CAPPluginCall) {
        guard let id = call.getString("leaderboardId") else { call.reject("leaderboardId is required"); return }
        let scope: GKLeaderboard.PlayerScope = call.getString("scope") == "friends" ? .friendsOnly : .global
        let count = max(1, min(100, call.getInt("count") ?? 10))
        GKLeaderboard.loadLeaderboards(IDs: [id]) { boards, error in
            guard let board = boards?.first, error == nil else {
                call.reject(error?.localizedDescription ?? "leaderboard not found"); return
            }
            board.loadEntries(for: scope, timeScope: .allTime, range: NSRange(location: 1, length: count)) { player, entries, _, error in
                if let error = error { call.reject(error.localizedDescription); return }
                func row(_ e: GKLeaderboard.Entry) -> [String: Any] {
                    ["rank": e.rank, "name": e.player.displayName, "score": e.score]
                }
                var result: [String: Any] = ["entries": (entries ?? []).map(row)]
                result["player"] = player.map(row) ?? NSNull()
                call.resolve(result)
            }
        }
    }

    @objc func showDashboard(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let vc: GKGameCenterViewController
            if let id = call.getString("leaderboardId") {
                vc = GKGameCenterViewController(leaderboardID: id, playerScope: .global, timeScope: .allTime)
            } else {
                vc = GKGameCenterViewController(state: .leaderboards)
            }
            vc.gameCenterDelegate = self
            self.bridge?.viewController?.present(vc, animated: true)
            call.resolve()
        }
    }
}

extension GameCenterPlugin: GKGameCenterControllerDelegate {
    public func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        gameCenterViewController.dismiss(animated: true)
    }
}
