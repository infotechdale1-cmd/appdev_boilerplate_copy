package expo.modules.tesseractocr

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.pdf.PdfRenderer
import android.media.ExifInterface
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.util.Base64
import android.util.Log
import com.googlecode.tesseract.android.TessBaseAPI
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream

class TesseractOcrModule : Module() {
  companion object {
    private const val TAG = "TesseractOcrModule"
    private const val DEFAULT_LANG = "eng"
  }

  override fun definition() = ModuleDefinition {
    Name("TesseractOcr")

    AsyncFunction("isAvailable") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      val tessDir = File(context.filesDir, "tesseract/tessdata")
      val targetFile = File(tessDir, "$DEFAULT_LANG.traineddata")
      if (targetFile.exists() && targetFile.length() > 0) return@AsyncFunction true
      try {
        context.assets.open("tessdata/$DEFAULT_LANG.traineddata").use { input ->
          input.available() > 0
        }
      } catch (_: Exception) {
        false
      }
    }

    AsyncFunction("getAvailableLanguages") {
      val context = appContext.reactContext ?: return@AsyncFunction listOf(DEFAULT_LANG)
      val langs = mutableSetOf<String>()
      
      // Check assets
      try {
        val assetFiles = context.assets.list("tessdata") ?: emptyArray()
        for (f in assetFiles) {
          if (f.endsWith(".traineddata")) {
            langs.add(f.removeSuffix(".traineddata"))
          }
        }
      } catch (_: Exception) {}

      // Check storage
      val storageDir = File(context.filesDir, "tesseract/tessdata")
      if (storageDir.exists() && storageDir.isDirectory) {
        storageDir.listFiles()?.forEach { file ->
          if (file.name.endsWith(".traineddata") && file.length() > 0) {
            langs.add(file.name.removeSuffix(".traineddata"))
          }
        }
      }

      if (langs.isEmpty()) listOf(DEFAULT_LANG) else langs.toList()
    }

    AsyncFunction("prepareTessData") Coroutine { langParam: String? ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val lang = langParam ?: DEFAULT_LANG
      withContext(Dispatchers.IO) {
        ensureTessDataReady(context, lang)
      }
    }

    AsyncFunction("recognize") Coroutine { imageUri: String, options: Map<String, Any?>? ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val lang = (options?.get("lang") as? String) ?: DEFAULT_LANG
      val pageSegMode = (options?.get("pageSegMode") as? Number)?.toInt() ?: TessBaseAPI.PageSegMode.PSM_AUTO
      val whitelist = options?.get("whitelist") as? String
      val blacklist = options?.get("blacklist") as? String

      val safeUriForLog = if (imageUri.startsWith("data:") || imageUri.length > 150) {
        "[Base64 input, length: ${imageUri.length}]"
      } else {
        imageUri
      }

      val startTime = System.currentTimeMillis()
      Log.i(TAG, "Starting OCR recognition | Language: $lang | PSM: $pageSegMode | Source: $safeUriForLog")

      withContext(Dispatchers.IO) {
        val tessDataParentPath = try {
          ensureTessDataReady(context, lang)
        } catch (e: Exception) {
          Log.e(TAG, "Tessdata preparation failed for language '$lang': ${e.message}", e)
          throw Exception("Tesseract language data missing for '$lang': ${e.message}")
        }

        val isPdfInput = isPdf(imageUri)
        val bitmaps = if (isPdfInput) {
          renderPdfPages(context, imageUri)
        } else {
          val bmp = loadAndOrientBitmap(context, imageUri)
            ?: throw Exception("Failed to load or decode image bitmap from: $safeUriForLog")
          listOf(bmp)
        }

        if (bitmaps.isEmpty()) {
          throw Exception("No readable pages or bitmap frames found in: $safeUriForLog")
        }

        var tess: TessBaseAPI? = null
        try {
          tess = TessBaseAPI()
          val initSuccess = tess.init(tessDataParentPath, lang)
          Log.i(TAG, "Tesseract engine initialization for '$lang': ${if (initSuccess) "SUCCESS" else "FAILED"}")
          if (!initSuccess) {
            throw Exception("Failed to initialize Tesseract OCR engine for language '$lang'")
          }

          tess.pageSegMode = pageSegMode
          if (!whitelist.isNullOrEmpty()) {
            tess.setVariable(TessBaseAPI.VAR_CHAR_WHITELIST, whitelist)
          }
          if (!blacklist.isNullOrEmpty()) {
            tess.setVariable(TessBaseAPI.VAR_CHAR_BLACKLIST, blacklist)
          }

          val textBuilder = StringBuilder()
          var totalConfidence = 0
          var validCount = 0

          for ((idx, bmp) in bitmaps.withIndex()) {
            tess.setImage(bmp)
            val pageText = tess.getUTF8Text() ?: ""
            val pageConf = tess.meanConfidence()
            if (pageText.isNotEmpty()) {
              if (bitmaps.size > 1) {
                textBuilder.append("--- Page ${idx + 1} ---\n")
              }
              textBuilder.append(pageText).append("\n\n")
              totalConfidence += pageConf
              validCount++
            }
          }

          val recognizedText = textBuilder.toString().trim()
          val avgConfidence = if (validCount > 0) totalConfidence / validCount else 0
          val durationMs = System.currentTimeMillis() - startTime

          val textPreview = if (recognizedText.length > 120) {
            recognizedText.take(120).replace("\n", " ") + "..."
          } else {
            recognizedText.replace("\n", " ")
          }

          Log.i(
            TAG,
            "OCR complete in ${durationMs}ms | Pages: ${bitmaps.size} | Conf: $avgConfidence% | Chars: ${recognizedText.length} | Preview: \"$textPreview\""
          )

          mapOf(
            "text" to recognizedText,
            "confidence" to avgConfidence
          )
        } finally {
          try {
            tess?.recycle()
          } catch (_: Exception) {}
          for (bmp in bitmaps) {
            try {
              bmp.recycle()
            } catch (_: Exception) {}
          }
        }
      }
    }
  }

  private fun isPdf(uriString: String): Boolean {
    val lower = uriString.lowercase()
    return lower.endsWith(".pdf") || lower.contains("application/pdf") || lower.startsWith("jvber") || uriString.contains("data:application/pdf")
  }

  private fun renderPdfPages(context: Context, uriString: String): List<Bitmap> {
    val bitmaps = mutableListOf<Bitmap>()
    var pfd: ParcelFileDescriptor? = null
    var renderer: PdfRenderer? = null
    var tempFile: File? = null

    try {
      if (uriString.startsWith("data:") || (!uriString.startsWith("content://") && !uriString.startsWith("file://") && !uriString.startsWith("/") && uriString.length > 200)) {
        val cleanBase64 = if (uriString.contains(",")) uriString.substringAfter(",") else uriString
        val bytes = Base64.decode(cleanBase64.trim(), Base64.DEFAULT)
        tempFile = File.createTempFile("pdf_scan_", ".pdf", context.cacheDir)
        FileOutputStream(tempFile).use { it.write(bytes) }
        pfd = ParcelFileDescriptor.open(tempFile, ParcelFileDescriptor.MODE_READ_ONLY)
      } else if (uriString.startsWith("content://")) {
        pfd = context.contentResolver.openFileDescriptor(Uri.parse(uriString), "r")
      } else {
        val path = if (uriString.startsWith("file://")) Uri.parse(uriString).path ?: uriString.removePrefix("file://") else uriString
        val file = File(path)
        if (file.exists()) {
          pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
        }
      }

      if (pfd != null) {
        renderer = PdfRenderer(pfd)
        val pageCount = renderer.pageCount
        Log.i(TAG, "Rendering PDF pages with PdfRenderer. Total pages: $pageCount")
        val maxPages = Math.min(pageCount, 5) // Process up to 5 timetable pages
        for (i in 0 until maxPages) {
          val page = renderer.openPage(i)
          val width = page.width * 2
          val height = page.height * 2
          val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
          bitmap.eraseColor(Color.WHITE)
          page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
          bitmaps.add(bitmap)
          page.close()
        }
      }
    } catch (e: Exception) {
      Log.e(TAG, "Error rendering PDF pages: ${e.message}", e)
    } finally {
      try { renderer?.close() } catch (_: Exception) {}
      try { pfd?.close() } catch (_: Exception) {}
      try { tempFile?.delete() } catch (_: Exception) {}
    }

    return bitmaps
  }

  private fun ensureTessDataReady(context: Context, lang: String): String {
    val tesseractRoot = File(context.filesDir, "tesseract")
    val tessDataDir = File(tesseractRoot, "tessdata")
    if (!tessDataDir.exists()) {
      tessDataDir.mkdirs()
    }

    val targetFile = File(tessDataDir, "$lang.traineddata")
    if (!targetFile.exists() || targetFile.length() == 0L) {
      val assetPath = "tessdata/$lang.traineddata"
      try {
        context.assets.open(assetPath).use { input ->
          FileOutputStream(targetFile).use { output ->
            input.copyTo(output)
          }
        }
        Log.i(TAG, "Successfully extracted $assetPath to ${targetFile.absolutePath} (${targetFile.length()} bytes)")
      } catch (e: Exception) {
        Log.e(TAG, "Could not copy $assetPath from assets", e)
        throw Exception("Tessdata for '$lang' not found in assets or internal storage.")
      }
    }

    return tesseractRoot.absolutePath
  }

  private fun loadAndOrientBitmap(context: Context, uriString: String): Bitmap? {
    var rawBytes: ByteArray? = null

    if (uriString.startsWith("data:") || (!uriString.startsWith("content://") && !uriString.startsWith("file://") && !uriString.startsWith("/") && uriString.length > 200)) {
      val cleanBase64 = if (uriString.contains(",")) uriString.substringAfter(",") else uriString
      try {
        rawBytes = Base64.decode(cleanBase64.trim(), Base64.DEFAULT)
      } catch (e: Exception) {
        Log.e(TAG, "Failed to decode base64 image data", e)
        return null
      }
    }

    fun openStream(): InputStream? {
      if (rawBytes != null) {
        return ByteArrayInputStream(rawBytes)
      }
      return try {
        val uri = Uri.parse(uriString)
        if (uri.scheme == "content") {
          context.contentResolver.openInputStream(uri)
        } else if (uri.scheme == "file") {
          val path = uri.path ?: uriString.removePrefix("file://")
          File(path).inputStream()
        } else {
          File(uriString).inputStream()
        }
      } catch (e: Exception) {
        Log.w(TAG, "Error opening stream from $uriString: ${e.message}")
        null
      }
    }

    // 1. Read EXIF orientation
    var orientation = ExifInterface.ORIENTATION_NORMAL
    try {
      if (rawBytes == null && uriString.startsWith("content://")) {
        try {
          context.contentResolver.openFileDescriptor(Uri.parse(uriString), "r")?.use { pfd ->
            val exif = ExifInterface(pfd.fileDescriptor)
            orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
          }
        } catch (_: Exception) {}
      } else if (rawBytes == null && (uriString.startsWith("file://") || uriString.startsWith("/"))) {
        val path = if (uriString.startsWith("file://")) Uri.parse(uriString).path ?: uriString.removePrefix("file://") else uriString
        val file = File(path)
        if (file.exists()) {
          val exif = ExifInterface(file.absolutePath)
          orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        }
      } else {
        openStream()?.use { input ->
          val exif = ExifInterface(input)
          orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        }
      }
    } catch (_: Exception) {}

    // 2. Decode bounds to prevent OOM on massive photos
    val boundsOptions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    openStream()?.use { input ->
      BitmapFactory.decodeStream(input, null, boundsOptions)
    } ?: return null

    val maxDimension = 1920
    var inSampleSize = 1
    val origW = boundsOptions.outWidth
    val origH = boundsOptions.outHeight
    if (origW > maxDimension || origH > maxDimension) {
      val halfW = origW / 2
      val halfH = origH / 2
      while ((halfW / inSampleSize) >= maxDimension || (halfH / inSampleSize) >= maxDimension) {
        inSampleSize *= 2
      }
    }

    // 3. Decode actual Bitmap
    val decodeOptions = BitmapFactory.Options().apply {
      this.inSampleSize = inSampleSize
      inPreferredConfig = Bitmap.Config.ARGB_8888
    }
    val decoded = openStream()?.use { input ->
      BitmapFactory.decodeStream(input, null, decodeOptions)
    } ?: return null

    // 4. Apply orientation transformation if needed
    if (orientation == ExifInterface.ORIENTATION_NORMAL || orientation == ExifInterface.ORIENTATION_UNDEFINED) {
      return decoded
    }

    val matrix = Matrix()
    when (orientation) {
      ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
      ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
      ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
      else -> return decoded
    }

    return try {
      val rotated = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
      if (rotated != decoded) {
        decoded.recycle()
      }
      rotated
    } catch (e: Exception) {
      Log.w(TAG, "Bitmap rotation failed: ${e.message}")
      decoded
    }
  }
}
