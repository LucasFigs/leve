import { getState } from '../store/store';
import { localRepository, recoveryExport, useStorageIssue } from '../store/persistence';
import { cloudEnabled, localDataOwner, syncNow, useCloud } from '../store/sync';

export function StorageNotice() {
  const issue = useStorageIssue();
  const authenticated = useCloud(s => s.auth === 'in');
  const accountId = useCloud(s => s.userId);
  const canExport = !cloudEnabled || (authenticated && !!localDataOwner() && localDataOwner() === accountId);
  if (!issue) return null;
  const exportData = () => {
    const url = URL.createObjectURL(new Blob([recoveryExport(getState())], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'leve-recuperacao.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <aside className="storage-notice" role="alert">
    <strong>{issue === 'recovery' ? 'Há dados locais que precisam de recuperação.' : issue === 'conflict' ? 'Outra aba alterou os dados deste aparelho.' : 'Não foi possível salvar neste aparelho.'}</strong>
    <p>{issue === 'storage' || issue === 'journal' ? 'Não foi possível confirmar a gravação local completa. Exporte uma cópia antes de fechar e libere espaço ou habilite o armazenamento.' : 'A gravação e a sincronização estão pausadas para preservar as versões. Exporte uma cópia antes de recarregar ou fechar esta aba.'}</p>
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      {canExport ? <button type="button" className="btn btn-sm btn-secondary" onClick={exportData}>Exportar recuperação</button> : <p>Entre na conta original para acessar a recuperação dos dados.</p>}
      {(issue === 'storage' || issue === 'journal') && <button type="button" className="btn btn-sm btn-secondary" onClick={() => {localRepository.save(getState());syncNow();}}>Tentar salvar novamente</button>}
    </div>
  </aside>;
}
