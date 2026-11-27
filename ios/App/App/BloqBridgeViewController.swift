import UIKit
import Capacitor

/// The app's root view controller. It exists to register BLOQ's local Game Center plugin,
/// which is not an npm package and so is not picked up by `cap sync`.
class BloqBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(GameCenterPlugin())
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
}
