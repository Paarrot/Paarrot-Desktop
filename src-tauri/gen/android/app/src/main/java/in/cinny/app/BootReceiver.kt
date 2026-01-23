package `in`.cinny.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Receives boot completed broadcast to restart the sync service
 * after device reboot.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            // Start the sync service after boot
            SyncService.start(context)
        }
    }
}
