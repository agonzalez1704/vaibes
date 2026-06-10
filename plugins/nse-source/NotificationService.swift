import UserNotifications

/// Vaibes Notification Service Extension.
/// On push arrival, if `data.audio_url` is set:
///   1. Download the mp3 to a temp file
///   2. Attach as UNNotificationAttachment so the user can play from the
///      expanded notification (long-press / pull down on the banner).
class NotificationService: UNNotificationServiceExtension {

  var contentHandler: ((UNNotificationContent) -> Void)?
  var bestAttempt: UNMutableNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    self.contentHandler = contentHandler
    self.bestAttempt = (request.content.mutableCopy() as? UNMutableNotificationContent)
    guard let content = self.bestAttempt else {
      contentHandler(request.content)
      return
    }

    // Expo wraps custom data under `body` → look there first, then fall back.
    let audioURLString: String? = {
      if let s = content.userInfo["audio_url"] as? String { return s }
      if let body = content.userInfo["body"] as? [String: Any],
         let s = body["audio_url"] as? String { return s }
      return nil
    }()

    guard let urlString = audioURLString, let url = URL(string: urlString) else {
      contentHandler(content)
      return
    }

    let task = URLSession.shared.downloadTask(with: url) { tempLocation, _, _ in
      defer {
        // Hand back content even if attachment fails.
        contentHandler(content)
      }
      guard let tempLocation = tempLocation else { return }

      // Move to a stable temp path with .mp3 extension so iOS recognizes it.
      let fm = FileManager.default
      let dst = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".mp3")
      try? fm.moveItem(at: tempLocation, to: dst)

      if let attachment = try? UNNotificationAttachment(
        identifier: "vaibe-audio",
        url: dst,
        options: [UNNotificationAttachmentOptionsTypeHintKey: "public.mp3"]
      ) {
        content.attachments = [attachment]
      }
    }
    task.resume()
  }

  override func serviceExtensionTimeWillExpire() {
    if let contentHandler = contentHandler, let bestAttempt = bestAttempt {
      contentHandler(bestAttempt)
    }
  }
}
