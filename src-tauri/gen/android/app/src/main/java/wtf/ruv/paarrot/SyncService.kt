package wtf.ruv.paarrot

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import androidx.core.app.NotificationCompat

/**
 * Foreground service that keeps the app alive for background sync.
 * This allows Matrix sync to continue even when the app is in the background.
 */
class SyncService : Service() {
    companion object {
        private const val NOTIFICATION_ID = 1
        private const val CHANNEL_ID = "paarrot_sync_channel"
        private const val CHANNEL_NAME = "Background Sync"
        private const val WAKE_LOCK_TAG = "Paarrot:SyncWakeLock"
        private const val ALARM_REQUEST_CODE = 1001
        private const val KEEP_ALIVE_INTERVAL_MS = 5 * 60 * 1000L // 5 minutes
    }

    private var wakeLock: PowerManager.WakeLock? = null
    private val handler = Handler(Looper.getMainLooper())
    private val keepAliveRunnable = object : Runnable {
        override fun run() {
            // Re-acquire wake lock periodically to prevent it from being released
            ensureWakeLock()
            handler.postDelayed(this, KEEP_ALIVE_INTERVAL_MS)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        acquireWakeLock()
        scheduleKeepAlive()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, createNotification())
        ensureWakeLock()
        return START_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacks(keepAliveRunnable)
        cancelAlarm()
        releaseWakeLock()
        super.onDestroy()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Restart service if app is swiped away
        val restartServiceIntent = Intent(applicationContext, SyncService::class.java)
        restartServiceIntent.setPackage(packageName)
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(restartServiceIntent)
        } else {
            startService(restartServiceIntent)
        }
        super.onTaskRemoved(rootIntent)
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
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): android.app.Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Paarrot")
            .setContentText("Connected to Matrix")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }

    private fun scheduleKeepAlive() {
        // Use handler for periodic wake lock refresh
        handler.postDelayed(keepAliveRunnable, KEEP_ALIVE_INTERVAL_MS)
        
        // Also set up alarm as backup
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
        
        // Schedule inexact repeating alarm to restart service periodically
        alarmManager.setInexactRepeating(
            AlarmManager.ELAPSED_REALTIME_WAKEUP,
            SystemClock.elapsedRealtime() + KEEP_ALIVE_INTERVAL_MS,
            KEEP_ALIVE_INTERVAL_MS,
            pendingIntent
        )
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
            // Acquire indefinitely - the service manages its own lifecycle
            acquire()
        }
    }

    private fun ensureWakeLock() {
        wakeLock?.let {
            if (!it.isHeld) {
                it.acquire()
            }
        } ?: acquireWakeLock()
    }

    private fun releaseWakeLock() {
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
            }
        }
        wakeLock = null
    }
}
