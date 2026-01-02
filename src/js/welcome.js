const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Caminho do arquivo onde salvaremos o histórico (na sua pasta de usuário)
const historyFile = path.join(os.homedir(), '.course_manager_recents.json');

// --- Funções de Histórico ---

function getRecentFolders() {
  try {
    if (fs.existsSync(historyFile)) {
      const data = fs.readFileSync(historyFile, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Erro ao ler histórico:', error);
  }
  return [];
}

function addToRecent(folderPath) {
  let recent = getRecentFolders();
  
  // Remove se já existir (para colocar no topo novamente)
  recent = recent.filter(p => p !== folderPath);
  
  // Adiciona no início da lista
  recent.unshift(folderPath);
  
  // Mantém apenas os últimos 5
  if (recent.length > 5) recent.pop();
  
  try {
    fs.writeFileSync(historyFile, JSON.stringify(recent));
  } catch (error) {
    console.error('Erro ao salvar histórico:', error);
  }
}

// --- Funções de Carregamento ---

// --- Funções de Carregamento e Gestão ---

async function loadCourseFromPath(folderPath) {
  if (!folderPath) return;

  const loadingEl = document.getElementById('loading');
  const recentsEl = document.getElementById('recentFoldersArea');

  if (loadingEl) loadingEl.style.display = 'block';
  if (recentsEl) recentsEl.style.display = 'none';

  try {
    const courses = await ipcRenderer.invoke('read-folder', folderPath);
    
    // Salva dados da sessão
    localStorage.setItem('coursesData', JSON.stringify(courses));
    localStorage.setItem('selectedFolder', folderPath);
    
    // Atualiza histórico
    addToRecent(folderPath);
    
    window.location.href = 'player.html';
  } catch (error) {
    console.error(error);
    alert('Erro ao carregar a pasta. Verifique se ela ainda existe.');
    if (loadingEl) loadingEl.style.display = 'none';
    // Se der erro, volta a mostrar os recentes
    renderRecents(); 
  }
}

function removeRecent(folderPathToRemove) {
    let recent = getRecentFolders();
    // Filtra removendo o item clicado
    recent = recent.filter(p => p !== folderPathToRemove);
    
    try {
        fs.writeFileSync(historyFile, JSON.stringify(recent));
        // Recarrega a lista visualmente
        renderRecents(); 
    } catch (error) {
        console.error('Erro ao salvar histórico:', error);
    }
}

function renderRecents() {
  const recentPaths = getRecentFolders();
  const container = document.getElementById('recentFoldersArea');
  const list = document.getElementById('recentList');
  
  if (!container || !list) return;

  if (recentPaths.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  list.innerHTML = ''; // Limpa a lista atual

  recentPaths.forEach(folderPath => {
    // 1. Cria o container (DIV em vez de BUTTON)
    // Isso permite colocar botões dentro dele
    const item = document.createElement('div');
    item.className = 'recent-item'; 
    item.title = folderPath;
    
    // Ação ao clicar no container (Abrir Curso)
    item.onclick = () => loadCourseFromPath(folderPath);

    const folderName = path.basename(folderPath);

    // 2. HTML Interno: Ícone/Texto na esquerda, Botão X na direita
    item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; flex: 1; overflow: hidden;">
            <i class="fas fa-folder" style="color: #52525b; transition: color 0.2s;"></i> 
            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${folderName}
            </span>
        </div>
    `;

    // 3. Cria o Botão de Excluir separadamente para adicionar o evento
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete-recent';
    deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
    deleteBtn.title = "Remover da lista";
    
    // IMPORTANTE: stopPropagation impede que o clique no X abra o curso
    deleteBtn.onclick = (e) => {
        e.stopPropagation(); 
        removeRecent(folderPath);
    };

    item.appendChild(deleteBtn);
    list.appendChild(item);
  });
}

// --- Inicialização ---

window.addEventListener('load', renderRecents);

document.getElementById('selectFolder').addEventListener('click', async () => {
  const folderPath = await ipcRenderer.invoke('select-folder');
  if (folderPath) {
    loadCourseFromPath(folderPath);
  }
});