export function openRawDevelopDialog(dialog, { name, source, develop, cancelDevelop }) {
  const control = id => dialog.querySelector('#' + id);
  const filename = control('raw-develop-filename');
  const image = control('raw-preview-image');
  const status = control('raw-develop-status');
  const exposure = control('raw-exposure');
  const whiteBalance = control('raw-white-balance');
  const previewButton = control('raw-develop-preview');
  const confirmButton = control('raw-import-confirm');
  const cancel = control('raw-import-cancel');
  const listeners = new AbortController();
  const listenerOptions = { signal: listeners.signal };
  let pending = null;
  let accepted = null;
  let hasPreview = false;

  filename.textContent = name;
  exposure.value = String(source.recipe?.exposure ?? 0);
  whiteBalance.value = source.recipe?.whiteBalance ?? 'camera';
  image.hidden = true;

  function controls(working) {
    for (const element of [exposure, whiteBalance, previewButton]) element.disabled = working;
    confirmButton.disabled = working || !hasPreview;
  }

  function invalidatePreview() {
    if (!hasPreview) return;
    hasPreview = false;
    controls(false);
    status.textContent = '设置已更改，请更新预览。';
  }

  async function run(preview) {
    if (pending || !dialog.open || !exposure.reportValidity()) return;
    const recipe = { exposure: exposure.valueAsNumber, whiteBalance: whiteBalance.value };
    controls(true);
    status.textContent = preview ? '正在生成预览…' : '正在按原尺寸冲洗…';
    pending = Promise.resolve().then(() => develop({ raw: source.data, format: source.format, recipe, preview }));
    try {
      const result = await pending;
      if (!dialog.open) return;
      if (source.sha256 && result.sha256 !== source.sha256) throw new Error('工程内 RAW 原件的校验值不匹配。');
      if (preview) {
        image.src = result.image;
        image.hidden = false;
        hasPreview = true;
        status.textContent = '预览 ' + result.width + ' × ' + result.height;
      } else {
        accepted = { ...result, recipe };
        dialog.close();
      }
    } catch (error) {
      if (dialog.open) status.textContent = 'RAW 冲洗失败：' + error.message;
    } finally {
      pending = null;
      if (dialog.open) controls(false);
    }
  }

  return new Promise(resolve => {
    exposure.addEventListener('input', invalidatePreview, listenerOptions);
    whiteBalance.addEventListener('change', invalidatePreview, listenerOptions);
    previewButton.addEventListener('click', () => void run(true), listenerOptions);
    confirmButton.addEventListener('click', () => void run(false), listenerOptions);
    cancel.addEventListener('click', () => dialog.close(), listenerOptions);
    dialog.addEventListener('close', () => {
      listeners.abort();
      image.removeAttribute('src');
      if (pending && cancelDevelop) void cancelDevelop().catch(() => {});
      void Promise.resolve(pending).catch(() => {}).then(() => resolve(accepted));
    }, { once: true, ...listenerOptions });
    dialog.showModal();
    void run(true);
  });
}
