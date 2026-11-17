import java.io.Console;
import java.security.SecureRandom;
import java.sql.*;
import java.util.*;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/** Run locally as the clinic administrator to provision an existing doctor. */
public class AdminCreateDoctor {
    private static String hash(String password) throws Exception {
        byte[] salt = new byte[16];
        new SecureRandom().nextBytes(salt);
        PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, 210000, 256);
        byte[] key;
        try {
            key = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                .generateSecret(spec).getEncoded();
        } finally { spec.clearPassword(); }
        return "pbkdf2:210000:" + Base64.getEncoder().encodeToString(salt)
            + ":" + Base64.getEncoder().encodeToString(key);
    }
    public static void main(String[] args) throws Exception {
        String dbPassword = System.getenv("MEDICONNECT_DB_PASSWORD");
        if (dbPassword == null || dbPassword.isBlank()) {
            System.err.println("Set MEDICONNECT_DB_PASSWORD first."); return;
        }
        Console console = System.console();
        if (console == null) {
            System.err.println("Run this in a terminal (not an IDE output pane)."); return;
        }
        int id = Integer.parseInt(console.readLine("Existing doctor ID: ").trim());
        String email = console.readLine("Doctor email: ").trim().toLowerCase(Locale.ROOT);
        char[] pwd = console.readPassword("New password: ");
        String password = new String(pwd);
        Arrays.fill(pwd, '\0');
        if (!email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$") ||
            password.length() < 8 || password.length() > 128 ||
            !password.matches("(?s).*\\p{L}.*") ||
            !password.matches("(?s).*\\d.*") ||
            !password.matches("(?s).*[\\p{P}\\p{S}].*")) {
            System.err.println("Use a valid email and a password with 8+ characters, a letter, number and special character.");
            return;
        }
        try (Connection c = DriverManager.getConnection(
            "jdbc:postgresql://localhost:5432/mediconnect_db", "postgres", dbPassword);
             PreparedStatement p = c.prepareStatement(
                "INSERT INTO doctor_accounts (doctor_id,email,password_hash) VALUES (?,?,?)")) {
            p.setInt(1,id); p.setString(2,email); p.setString(3,hash(password));
            p.executeUpdate();
            System.out.println("Doctor account created. You may now sign in.");
        }
    }
}
