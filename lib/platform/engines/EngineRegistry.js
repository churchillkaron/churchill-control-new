import * as Engines from "@/components/workspace/engines";

export const ENGINE_REGISTRY = {

  create: Engines.CreateEngine,
  form: Engines.CreateEngine,

  import: Engines.ImportEngine,
  export: Engines.ExportEngine,

  ai: Engines.AIEngine,

  workflow: null,
  finance: null,
  communication: null,
  document: null,
  generic: null,

  approve: Engines.ApproveEngine,
  reject: Engines.RejectEngine,
  assign: Engines.AssignEngine,
  complete: Engines.CompleteEngine,
  reopen: Engines.ReopenEngine,

  merge: Engines.MergeEngine,
  split: Engines.SplitEngine,
  duplicate: Engines.DuplicateEngine,
  archive: Engines.ArchiveEngine,
  delete: Engines.DeleteEngine,
  restore: Engines.RestoreEngine,

  sync: Engines.SyncEngine,
  publish: Engines.PublishEngine,

  reconcile: Engines.ReconcileEngine,
  post: Engines.PostEngine,
  reverse: Engines.ReverseEngine,
  allocate: Engines.AllocateEngine,
  close_period: Engines.ClosePeriodEngine,
  lock: Engines.LockEngine,
  unlock: Engines.UnlockEngine,

  email: Engines.EmailEngine,
  sms: Engines.SMSEngine,
  whatsapp: Engines.WhatsAppEngine,

  print: Engines.PrintEngine,
  download: Engines.DownloadEngine,
  upload: Engines.UploadEngine,
  attach: Engines.AttachEngine,
  sign: Engines.SignEngine,
  ocr: Engines.OCREngine,
  convert: Engines.ConvertEngine,

  audit: Engines.AuditEngine,
  history: Engines.HistoryEngine,
  timeline: Engines.TimelineEngine,
  permissions: Engines.PermissionsEngine,
  settings: Engines.SettingsEngine,

};

export function getEngine(name){
  return ENGINE_REGISTRY[name] || null;
}
