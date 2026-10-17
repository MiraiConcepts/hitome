package expo.modules.calendarstore

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Process
import android.os.SystemClock

/** A process this young was started for the broadcast itself. */
private const val FRESH_PROCESS_MS = 3_000L

/** How long after a restart the widgets are asked to redraw. */
private const val REDRAW_DELAY_MS = 1_500L

/**
 * Redraws the home-screen widget when the phone's time zone changes (after
 * landing somewhere, say). The JavaScript engine reads the zone once, when it
 * starts, and is never told of a change, so a widget drawn by a process that
 * was already running keeps the old zone's times (audit F-081).
 *
 * - Started for this broadcast: the engine is new and has the new zone, so
 *   the widgets redraw now.
 * - Running in the background: asked to redraw a moment from now, and this
 *   process ends, so the redraw starts a new one in the new zone. Nothing is
 *   on screen to lose.
 * - On screen: left alone; the app starts itself again the next time it
 *   comes forward (src/utils/region.ts), and that launch redraws the widget.
 */
class ZoneChangeReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_TIMEZONE_CHANGED) return
    val update = widgetUpdate(context) ?: return
    val age = SystemClock.elapsedRealtime() - Process.getStartElapsedRealtime()
    if (age < FRESH_PROCESS_MS) {
      context.sendBroadcast(update)
      return
    }
    if (AppVisibility.inForeground) return
    val later = PendingIntent.getBroadcast(
      context,
      0,
      update,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val at = SystemClock.elapsedRealtime() + REDRAW_DELAY_MS
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms())
      alarms.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, later)
    else
      alarms.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, later)
    Process.killProcess(Process.myPid())
  }

  /** An update for every placed widget of this app, or null with none. */
  private fun widgetUpdate(context: Context): Intent? {
    val manager = AppWidgetManager.getInstance(context)
    val providers = manager.installedProviders
      .map { it.provider }
      .filter { it.packageName == context.packageName }
    val provider: ComponentName = providers.firstOrNull() ?: return null
    val ids = manager.getAppWidgetIds(provider)
    if (ids.isEmpty()) return null
    return Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
      .setComponent(provider)
      .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
  }
}

/** Whether one of the app's screens is in front, kept by CalendarStoreModule. */
object AppVisibility {
  @Volatile
  var inForeground = false
}
