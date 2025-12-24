const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');

let mainWindow;
const watchedVideosFile = path.join(app.getPath('userData'), 'watched-videos.json');
const notesFile = path.join(app.getPath('userData'), 'user-notes.json');

function loadWatchedVideos() {
  try {
    if (fs.existsSync(watchedVideosFile)) {
      const data = fs.readFileSync(watchedVideosFile, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Erro ao carregar vídeos assistidos:', error);
  }
  return {};
}

function saveWatchedVideos(watchedVideos) {
  try {
    fs.writeFileSync(watchedVideosFile, JSON.stringify(watchedVideos, null, 2));
  } catch (error) {
    console.error('Erro ao salvar vídeos assistidos:', error);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    },
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'favicon.ico'),
  });

  mainWindow.loadFile('src/welcome.html');
}

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (!result.canceled) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('read-folder', async (event, folderPath) => {
  const courses = [];
  const watchedVideos = loadWatchedVideos();
  
  try {
    const folders = fs.readdirSync(folderPath);
    
    // Função para ordenar arquivos alfanumericamente
    const naturalSort = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

    for (const folder of folders) {
      const coursePath = path.join(folderPath, folder);
      
      if (fs.statSync(coursePath).isDirectory()) {
        
        // 1. LISTAR ARQUIVOS DA PASTA
        const allFiles = fs.readdirSync(coursePath);

        // 2. FILTRAR VÍDEOS E HTMLs (CONTEÚDO PRINCIPAL)
        const lessons = allFiles
          .filter(file => file.endsWith('.mp4') || file.endsWith('.mkv') || file.endsWith('.html'))
          .sort(naturalSort) 
          .map(file => {
            const filePath = path.join(coursePath, file);
            const isVideo = file.endsWith('.mp4') || file.endsWith('.mkv');
            
            let subtitlePath = null;
            if (isVideo) {
                const vttName = file.replace(/\.(mp4|mkv)$/, '.vtt');
                const vttFullPath = path.join(coursePath, vttName);
                if (fs.existsSync(vttFullPath)) subtitlePath = vttFullPath;
            }

            return {
              name: file,
              path: filePath,
              type: isVideo ? 'video' : 'text',
              subtitle: subtitlePath,
              watched: watchedVideos[filePath] || false
            };
          });

        // 3. MATERIAIS EXTRAS (.url dentro de external-links)
        const linksPath = path.join(coursePath, 'external-links');
        let externalLinks = [];
        
        if (fs.existsSync(linksPath) && fs.statSync(linksPath).isDirectory()) {
            const linkFiles = fs.readdirSync(linksPath);
            
            externalLinks = linkFiles
                .filter(file => file.endsWith('.url')) // Filtra apenas arquivos .url
                .map(file => {
                    const fullPath = path.join(linksPath, file);
                    try {
                        // Lê o conteúdo do arquivo .url
                        const content = fs.readFileSync(fullPath, 'utf8');
                        // Regex para extrair o link que vem depois de "URL="
                        const match = content.match(/URL=(.*)/i); 
                        const url = match ? match[1].trim() : '';
                        
                        return {
                            name: file.replace('.url', ''), // Remove a extensão do nome
                            url: url,
                            path: fullPath, // Guardamos o path original se precisar
                            type: 'link'
                        };
                    } catch (e) {
                        return null;
                    }
                })
                .filter(item => item && item.url); // Remove itens inválidos
        }
        
        // Adiciona o curso se tiver aulas
        if (lessons.length > 0) {
          courses.push({
            name: folder,
            lessons, 
            externalLinks // Passa a lista de links extraídos
          });
        }
      }
    }
  } catch (error) {
    console.error("Erro ao ler pastas:", error);
  }
 
  return courses;
});

ipcMain.handle('get-video-url', (event, videoPath) => {
  return url.pathToFileURL(videoPath).href;
});

// Abre arquivos locais (PDFs, HTMLs extras)
ipcMain.handle('open-file-external', async (event, filePath) => {
    await shell.openPath(filePath);
});

// Abre links de internet (http://...) no navegador padrão
ipcMain.handle('open-external-url', async (event, url) => {
  await shell.openExternal(url);
});

ipcMain.handle('toggle-watched', async (event, filePath, isWatched) => {
  const watchedVideos = loadWatchedVideos();
  watchedVideos[filePath] = isWatched;
  saveWatchedVideos(watchedVideos);
  return true;
});

// --- SISTEMA DE ANOTAÇÕES ---

function loadNotes() {
  try {
    if (fs.existsSync(notesFile)) {
      return JSON.parse(fs.readFileSync(notesFile, 'utf8'));
    }
  } catch (error) {
    console.error('Erro ao ler anotações:', error);
  }
  return {};
}

ipcMain.handle('get-note', (event, videoPath) => {
  const notes = loadNotes();
  return notes[videoPath] || ''; 
});

ipcMain.handle('save-note', (event, videoPath, text) => {
  const notes = loadNotes();
  notes[videoPath] = text;
  try {
    fs.writeFileSync(notesFile, JSON.stringify(notes, null, 2));
  } catch (error) {
    console.error('Erro ao salvar nota:', error);
  }
});