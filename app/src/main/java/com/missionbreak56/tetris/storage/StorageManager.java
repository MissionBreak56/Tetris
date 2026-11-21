package com.missionbreak56.tetris.storage;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.regex.Pattern;

/**
 * Arquivos pequenos e nomeados numa pasta do app, com gravação atômica (arquivo temporário + fsync + rename):
 * uma queda no meio da gravação nunca deixa o arquivo final pela metade. JVM pura (testável fora do Android).
 */
public final class StorageManager {
    private static final Pattern NAME = Pattern.compile("^[a-z0-9][a-z0-9._-]{0,39}$");
    public static final int MAX_BYTES = 48_000_000;

    private final File dir;

    public StorageManager(File dir) { this.dir = dir; }

    public static boolean validName(String n) { return n != null && NAME.matcher(n).matches() && !n.endsWith(".tmp"); }

    private File file(String name) {
        if (!validName(name)) throw new IllegalArgumentException("nome inválido");
        return new File(dir, name);
    }

    /** Grava de forma atômica. false em qualquer falha (disco cheio, permissão): nunca finge sucesso. */
    public synchronized boolean writeAtomic(String name, byte[] data) {
        if (data == null || data.length > MAX_BYTES) return false;
        File f = file(name), tmp = new File(dir, name + ".tmp");
        FileOutputStream out = null;
        try {
            if (!dir.isDirectory() && !dir.mkdirs() && !dir.isDirectory()) return false;
            out = new FileOutputStream(tmp);
            out.write(data);
            out.flush();
            out.getFD().sync();
            out.close(); out = null;
            if (!tmp.renameTo(f)) { tmp.delete(); return false; }
            return true;
        } catch (IOException e) {
            return false;
        } finally {
            if (out != null) { try { out.close(); } catch (IOException ignored) { } }
            if (tmp.exists()) tmp.delete();     // sobra de uma gravação interrompida
        }
    }

    /** Bytes do arquivo ou null se não existe/não pôde ser lido. */
    public synchronized byte[] read(String name) {
        File f = file(name);
        if (!f.isFile() || f.length() > MAX_BYTES) return null;
        InputStream in = null;
        try {
            in = new FileInputStream(f);
            byte[] b = new byte[(int) f.length()];
            int off = 0, n;
            while (off < b.length && (n = in.read(b, off, b.length - off)) > 0) off += n;
            return off == b.length ? b : null;
        } catch (IOException e) {
            return null;
        } finally {
            if (in != null) { try { in.close(); } catch (IOException ignored) { } }
        }
    }

    public synchronized boolean exists(String name) { return file(name).isFile(); }

    public synchronized boolean delete(String name) { File f = file(name); return !f.exists() || f.delete(); }
}
