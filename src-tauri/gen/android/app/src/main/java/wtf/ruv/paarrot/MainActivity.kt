package wtf.ruv.paarrot

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  companion object {
    private const val TAG = "PaarrotMain"
  }
  
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    
    // Start the foreground sync service to keep the app alive for notifications
    startSyncService()
    
    // Request battery optimization exemption for reliable background operation
    requestBatteryOptimizationExemption()
  }
  
  override fun onResume() {
    super.onResume()
    // Ensure service is running when app comes to foreground
    startSyncService()
  }
  
  private fun startSyncService() {
    try {
      val serviceIntent = Intent(this, SyncService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        startForegroundService(serviceIntent)
      } else {
        startService(serviceIntent)
      }
      Log.d(TAG, "SyncService started")
    } catch (e: Exception) {
      Log.e(TAG, "Failed to start SyncService", e)
    }
  }
  
  private fun requestBatteryOptimizationExemption() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      val powerManager = getSystemService(POWER_SERVICE) as PowerManager
      if (!powerManager.isIgnoringBatteryOptimizations(packageName)) {
        Log.d(TAG, "Requesting battery optimization exemption")
        try {
          val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:$packageName")
          }
          startActivity(intent)
        } catch (e: Exception) {
          Log.e(TAG, "Failed to request battery optimization exemption", e)
          // Try opening battery settings instead
          try {
            val settingsIntent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            startActivity(settingsIntent)
          } catch (e2: Exception) {
            Log.e(TAG, "Failed to open battery settings", e2)
          }
        }
      } else {
        Log.d(TAG, "Already exempt from battery optimization")
      }
    }
  }
}
