import { useCallback, useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { generateSecureApiKey } from '@/utils/apiKeys';
import { isValidApiKeyCharset } from '@/utils/validation';
import styles from './apiKeys.module.scss';

type NewApiKeyModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (apiKey: string) => void;
  existingKeys?: string[];
};

/**
 * NewApiKeyModal is the lightweight "decide on the api key string" step in
 * the new create flow. Once the user confirms, the caller is responsible
 * for routing to the edit page. No policy fields live here.
 *
 * The actual input state lives on {@link NewApiKeyModalBody}, which is only
 * mounted while `open` is true so every open gets a fresh generated key
 * without a state-syncing effect on the parent.
 */
export function NewApiKeyModal({ open, onClose, onConfirm, existingKeys = [] }: NewApiKeyModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="新建 API Key" footer={null}>
      {open ? (
        <NewApiKeyModalBody
          existingKeys={existingKeys}
          onCancel={onClose}
          onConfirm={onConfirm}
        />
      ) : null}
    </Modal>
  );
}

type NewApiKeyModalBodyProps = {
  existingKeys: string[];
  onCancel: () => void;
  onConfirm: (apiKey: string) => void;
};

function NewApiKeyModalBody({ existingKeys, onCancel, onConfirm }: NewApiKeyModalBodyProps) {
  const inputId = useId();
  const [apiKey, setApiKey] = useState(() => generateSecureApiKey());
  const [error, setError] = useState('');

  const handleGenerate = useCallback(() => {
    setApiKey(generateSecureApiKey());
    setError('');
  }, []);

  const handleConfirm = useCallback(() => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setError('API Key 不能为空');
      return;
    }
    if (!isValidApiKeyCharset(trimmed)) {
      setError('API Key 包含无效字符');
      return;
    }
    if (existingKeys.some((key) => key === trimmed)) {
      setError('API Key 已存在');
      return;
    }
    onConfirm(trimmed);
  }, [apiKey, existingKeys, onConfirm]);

  return (
    <>
      <div className="form-group">
        <label htmlFor={inputId}>API Key</label>
        <div className={styles.createModalInputRow}>
          <input
            id={inputId}
            className="input"
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value);
              if (error) setError('');
            }}
            placeholder="输入或生成 API Key"
            aria-invalid={Boolean(error)}
          />
          <Button type="button" variant="secondary" size="sm" onClick={handleGenerate}>
            生成
          </Button>
        </div>
        <div className="hint">
          已自动生成一个安全 API Key。你可以手动修改，或点击“生成”重新创建。
        </div>
        {error && <div className="error-box">{error}</div>}
      </div>
      <div className={styles.createModalHint}>
        确认后会跳转到编辑页，填写完成后点击“保存”才会真正创建并持久化。
      </div>
      <div className={styles.createModalFooter}>
        <Button variant="secondary" onClick={onCancel}>
          取消
        </Button>
        <Button onClick={handleConfirm}>继续配置</Button>
      </div>
    </>
  );
}
