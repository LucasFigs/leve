import { getState } from '../store/store';
import { localRepository, recoveryExport, useStorageIssue } from '../store/persistence';

export function StorageNotice() {
  const issue = useStorageIssue();
  if (!issue) return null;
  const exportData = () => {
    const url = URL.createObjectURL(new Blob([recoveryExport(getState())], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'leve-recuperacao.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <aside className="storage-notice" role="alert">
    <strong>{issue === 'recovery' ? 'Há dados locais que precisam de recuperação.' : issue === 'conflict' ? 'Outra aba alterou os dados deste aparelho.' : 'Não foi possível salvar neste aparelho.'}</strong>
    <p>{issue === 'storage' ? 'As mudanças continuam na memória. Exporte uma cópia antes de fechar e libere espaço ou habilite o armazenamento.' : 'A gravação e a sincronização estão pausadas para preservar as versões. Exporte uma cópia antes de recarregar ou fechar esta aba.'}</p>
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <button type="button" className="btn btn-sm btn-secondary" onClick={exportData}>Exportar recuperação</button>
      {issue === 'storage' && <button type="button" className="btn btn-sm btn-secondary" onClick={() => localRepository.save(getState())}>Tentar salvar novamente</button>}
    </div>
  </aside>;
}
