import { app } from 'electron'

export class RecentProjects {
  static add(filePath: string) {
    app.addRecentDocument(filePath)
  }

  static clear() {
    app.clearRecentDocuments()
  }
}
