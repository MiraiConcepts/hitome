package expo.modules.calendarstore

import android.accounts.Account
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.ContentResolver
import android.content.ContentValues
import android.database.ContentObserver
import android.database.Cursor
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.CalendarContract
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val ON_CHANGE = "onChange"

/**
 * A thin bridge to Android's calendar store (CalendarContract) — the shared
 * store DAVx⁵, Google and other sync apps fill, and Etar or Fossify read.
 * Deliberately generic: rows in, rows out. Every calendar decision (which
 * occurrences an edit reaches, undo, moves) is made in TypeScript, where it
 * is tested; this file only moves values across.
 */
class CalendarStoreModule : Module() {
  private var observer: ContentObserver? = null

  private val resolver: ContentResolver
    get() = appContext.reactContext?.contentResolver
      ?: throw IllegalStateException("No React context")

  override fun definition() = ModuleDefinition {
    Name("CalendarStore")

    Events(ON_CHANGE)

    AsyncFunction("query") { uri: String, projection: List<String>, selection: String?, args: List<String>?, sort: String? ->
      resolver.query(Uri.parse(uri), projection.toTypedArray(), selection, args?.toTypedArray(), sort)
        ?.use { cursor -> rows(cursor) }
        ?: emptyList()
    }

    AsyncFunction("insert") { uri: String, values: Map<String, Any?> ->
      val inserted = resolver.insert(Uri.parse(uri), contentValues(values))
        ?: throw IllegalStateException("Insert into $uri was refused")
      inserted.lastPathSegment
    }

    AsyncFunction("update") { uri: String, values: Map<String, Any?>, selection: String?, args: List<String>? ->
      resolver.update(Uri.parse(uri), contentValues(values), selection, args?.toTypedArray())
    }

    AsyncFunction("delete") { uri: String, selection: String?, args: List<String>? ->
      resolver.delete(Uri.parse(uri), selection, args?.toTypedArray())
    }

    // Ask every account that has calendars here to sync now — what Etar's
    // Refresh does. The sync app (DAVx⁵) decides when it actually runs.
    AsyncFunction("requestSync") {
      val accounts = mutableSetOf<Pair<String, String>>()
      resolver.query(
        CalendarContract.Calendars.CONTENT_URI,
        arrayOf(CalendarContract.Calendars.ACCOUNT_NAME, CalendarContract.Calendars.ACCOUNT_TYPE),
        null, null, null
      )?.use { cursor ->
        while (cursor.moveToNext()) {
          val name = cursor.getString(0) ?: continue
          val type = cursor.getString(1) ?: continue
          if (type != CalendarContract.ACCOUNT_TYPE_LOCAL) accounts.add(name to type)
        }
      }
      val extras = Bundle().apply {
        putBoolean(ContentResolver.SYNC_EXTRAS_MANUAL, true)
        putBoolean(ContentResolver.SYNC_EXTRAS_EXPEDITED, true)
      }
      for ((name, type) in accounts)
        ContentResolver.requestSync(Account(name, type), CalendarContract.AUTHORITY, extras)
      accounts.size
    }

    // Open another app (DAVx⁵) by package. A launcher intent addressed to a
    // package needs no <queries> entry, unlike looking the app up first;
    // false when it is not installed.
    AsyncFunction("openApp") { pkg: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val intent = Intent(Intent.ACTION_MAIN)
        .addCategory(Intent.CATEGORY_LAUNCHER)
        .setPackage(pkg)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        context.startActivity(intent)
        true
      } catch (e: ActivityNotFoundException) {
        false
      }
    }

    // Changes to the store — the app's own writes and a sync landing alike.
    // Watching needs calendar access, which a first run does not have yet:
    // the listener attaching only tries, and "watch" tries again once access
    // is granted.
    OnStartObserving {
      observing = true
      ensureObserver()
    }

    AsyncFunction("watch") {
      ensureObserver()
    }

    OnStopObserving {
      observing = false
      observer?.let { resolver.unregisterContentObserver(it) }
      observer = null
    }
  }

  private var observing = false

  /** Register the store observer if someone is listening and it is not
   *  registered yet; true once it is. */
  private fun ensureObserver(): Boolean {
    if (!observing) return false
    if (observer != null) return true
    val watcher = object : ContentObserver(Handler(Looper.getMainLooper())) {
      override fun onChange(selfChange: Boolean) {
        sendEvent(ON_CHANGE, Bundle())
      }
    }
    return try {
      resolver.registerContentObserver(CalendarContract.CONTENT_URI, true, watcher)
      observer = watcher
      true
    } catch (e: SecurityException) {
      false
    }
  }

  private fun rows(cursor: Cursor): List<Map<String, Any?>> {
    val out = ArrayList<Map<String, Any?>>(cursor.count)
    while (cursor.moveToNext()) {
      val row = HashMap<String, Any?>(cursor.columnCount)
      for (i in 0 until cursor.columnCount) {
        row[cursor.getColumnName(i)] = when (cursor.getType(i)) {
          Cursor.FIELD_TYPE_NULL -> null
          // Millisecond timestamps exceed Int; JS numbers hold them exactly.
          Cursor.FIELD_TYPE_INTEGER -> cursor.getLong(i).toDouble()
          Cursor.FIELD_TYPE_FLOAT -> cursor.getDouble(i)
          else -> cursor.getString(i)
        }
      }
      out.add(row)
    }
    return out
  }

  private fun contentValues(values: Map<String, Any?>): ContentValues {
    val out = ContentValues()
    for ((key, value) in values) {
      when (value) {
        null -> out.putNull(key)
        is String -> out.put(key, value)
        is Boolean -> out.put(key, if (value) 1 else 0)
        // JS numbers arrive as Double; whole ones are the store's longs.
        is Number -> {
          val d = value.toDouble()
          if (d % 1.0 == 0.0) out.put(key, d.toLong()) else out.put(key, d)
        }
        else -> out.put(key, value.toString())
      }
    }
    return out
  }
}
