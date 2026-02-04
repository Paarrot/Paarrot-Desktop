package wtf.ruv.paarrot

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Foreground service that keeps the app alive for background sync.
 * This allows Matrix sync to continue even when the app is in the background.
 */
class SyncService : Service() {
    companion object {
        private const val TAG = "PaarrotSync"
        private const val NOTIFICATION_ID = 1
        private const val CHANNEL_ID = "paarrot_sync_channel"
        private const val CHANNEL_NAME = "Background Sync"
        private const val WAKE_LOCK_TAG = "Paarrot:SyncWakeLock"
        private const val ALARM_REQUEST_CODE = 1001
        private const val KEEP_ALIVE_INTERVAL_MS = 4 * 60 * 1000L // 4 minutes (before 5 min Doze threshold)
        private const val WAKE_LOCK_TIMEOUT_MS = 10 * 60 * 1000L // 10 minutes max wake lock
    }

    private var wakeLock: PowerManager.WakeLock? = null
    private val handler = Handler(Looper.getMainLooper())
    private var isRunning = false
    
    private val keepAliveRunnable = object : Runnable {
        override fun run() {
            if (!isRunning) return
            Log.d(TAG, "Keep-alive tick - refreshing wake lock")
            ensureWakeLock()
            refreshNotification()
            handler.postDelayed(this, KEEP_ALIVE_INTERVAL_MS)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "SyncService created")
        isRunning = true
        createNotificationChannel()
        acquireWakeLock()
        scheduleKeepAlive()
        requestBatteryOptimizationExemption()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "SyncService onStartCommand")
        startForeground(NOTIFICATION_ID, createNotification())
        ensureWakeLock()
        // Return REDELIVER_INTENT so the system restarts us with the last intent
        return START_REDELIVER_INTENT
    }

    override fun onDestroy() {
        Log.d(TAG, "SyncService being destroyed - scheduling restart")
        isRunning = false
        handler.removeCallbacks(keepAliveRunnable)
        
        // Schedule immediate restart
        scheduleRestart()
        
        releaseWakeLock()
        super.onDestroy()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        Log.d(TAG, "Task removed - scheduling restart")
        scheduleRestart()
        super.onTaskRemoved(rootIntent)
    }
    
    override fun onLowMemory() {
        Log.w(TAG, "Low memory warning")
        super.onLowMemory()
    }
    
    override fun onTrimMemory(level: Int) {
        Log.d(TAG, "Trim memory level: $level")
        super.onTrimMemory(level)
    }
    
    private fun scheduleRestart() {
        // Try to restart the service immediately
        val restartIntent = Intent(applicationContext, SyncService::class.java)
        restartIntent.setPackage(packageName)
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                startForegroundService(restartIntent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to restart service directly", e)
                // Fall back to alarm
                scheduleAlarmRestart()
            }
        } else {
            startService(restartIntent)
        }
    }
    
    private fun scheduleAlarmRestart() {
        val alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(this, SyncService::class.java)
        val pendingIntent = PendingIntent.getService(
            this,
            ALARM_REQUEST_CODE + 1,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        // Schedule restart in 1 second
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                SystemClock.elapsedRealtime() + 1000,
                pendingIntent
            )
        } else {
            alarmManager.setExact(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                SystemClock.elapsedRealtime() + 1000,
                pendingIntent
            )
        }
    }

    private fun requestBatteryOptimizationExemption() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            if (!powerManager.isIgnoringBatteryOptimizations(packageName)) {
                Log.d(TAG, "Requesting battery optimization exemption")
                // We can't directly request, but the app should prompt the user
                // This is just a note that we need the exemption
            }
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps Paarrot connected for message notifications"
                setShowBadge(false)
                enableLights(false)
                enableVibration(false)
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): android.app.Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Paarrot")
            .setContentText("Connected to Matrix")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setShowWhen(false)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }
    
    private fun refreshNotification() {
        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.notify(NOTIFICATION_ID, createNotification())
    }

    private fun scheduleKeepAlive() {
        handler.postDelayed(keepAliveRunnable, KEEP_ALIVE_INTERVAL_MS)
        scheduleAlarm()
    }

    private fun scheduleAlarm() {
        val alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(this, SyncService::class.java)
        val pendingIntent = PendingIntent.getService(
            this,
            ALARM_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        // Use setExactAndAllowWhileIdle for better Doze mode support
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                SystemClock.elapsedRealtime() + KEEP_ALIVE_INTERVAL_MS,
                pendingIntent
            )
        } else {
            alarmManager.setExact(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                SystemClock.elapsedRealtime() + KEEP_ALIVE_INTERVAL_MS,
                pendingIntent
            )
        }
    }

    private fun cancelAlarm() {
        val alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(this, SyncService::class.java)
        val pendingIntent = PendingIntent.getService(
            this,
            ALARM_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        alarmManager.cancel(pendingIntent)
    }

    private fun acquireWakeLock() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            WAKE_LOCK_TAG
        ).apply {
            // Acquire with timeout to prevent battery drain if something goes wrong
            acquire(WAKE_LOCK_TIMEOUT_MS)
        }
        Log.d(TAG, "Wake lock acquired")
    }

    private fun ensureWakeLock() {
        wakeLock?.let {
            if (!it.isHeld) {
                Log.d(TAG, "Wake lock was released, re-acquiring")
                it.acquire(WAKE_LOCK_TIMEOUT_MS)
            }
        } ?: run {
            Log.d(TAG, "Wake lock was null, creating new one")
            acquireWakeLock()
        }
        
        // Re-schedule alarm each time we refresh
        scheduleAlarm()
    }

    private fun releaseWakeLock() {
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
                Log.d(TAG, "Wake lock released")
            }
        }
        wakeLock = null
    }
}
