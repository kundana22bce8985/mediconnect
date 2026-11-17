
import java.io.Console;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

public class AdminCreateAccount {

    private static final String DB_URL =
        "jdbc:postgresql://localhost:5432/mediconnect_db";

    private static final String DB_USER =
        "postgres";

    private static final int ITERATIONS = 210000;
    private static final int KEY_LENGTH = 256;

    public static void main(String[] args) throws Exception {

        Console console = System.console();

        if (console == null) {
            System.out.println(
                "Run this program from a PowerShell terminal."
            );
            return;
        }

        String dbPassword =
            System.getenv("MEDICONNECT_DB_PASSWORD");

        if (dbPassword == null || dbPassword.isBlank()) {
            System.out.println(
                "MEDICONNECT_DB_PASSWORD is not set."
            );
            return;
        }

        String email = console.readLine(
            "Administrator email: "
        ).trim().toLowerCase();

        if (!email.matches(
            "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"
        )) {
            System.out.println("Invalid email address.");
            return;
        }

        char[] password = console.readPassword(
            "Create administrator password: "
        );

        char[] confirmation = console.readPassword(
            "Confirm administrator password: "
        );

        if (!Arrays.equals(password, confirmation)) {
            System.out.println("Passwords do not match.");
            Arrays.fill(password, '\0');
            Arrays.fill(confirmation, '\0');
            return;
        }

        if (!strongPassword(password)) {
            System.out.println(
                "Password must contain at least 12 characters, " +
                "uppercase, lowercase, number, and special character."
            );

            Arrays.fill(password, '\0');
            Arrays.fill(confirmation, '\0');
            return;
        }

        try {
            String hash = hashPassword(password);

            try (Connection conn = DriverManager.getConnection(
                    DB_URL, DB_USER, dbPassword);
                 PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO admin_accounts " +
                    "(email, password_hash, active) " +
                    "VALUES (?, ?, TRUE)"
                 )) {

                ps.setString(1, email);
                ps.setString(2, hash);

                ps.executeUpdate();

                System.out.println(
                    "Administrator account created successfully."
                );
            }
        } finally {
            Arrays.fill(password, '\0');
            Arrays.fill(confirmation, '\0');
        }
    }

    private static boolean strongPassword(char[] password) {

        if (password.length < 12) return false;

        boolean upper = false;
        boolean lower = false;
        boolean digit = false;
        boolean special = false;

        for (char c : password) {
            if (Character.isUpperCase(c)) upper = true;
            else if (Character.isLowerCase(c)) lower = true;
            else if (Character.isDigit(c)) digit = true;
            else special = true;
        }

        return upper && lower && digit && special;
    }

    private static String hashPassword(
        char[] password
    ) throws Exception {

        byte[] salt = new byte[16];
        new SecureRandom().nextBytes(salt);

        PBEKeySpec spec = new PBEKeySpec(
            password, salt, ITERATIONS, KEY_LENGTH
        );

        byte[] hash;

        try {
            SecretKeyFactory factory =
                SecretKeyFactory.getInstance(
                    "PBKDF2WithHmacSHA256"
                );

            hash = factory.generateSecret(spec)
                          .getEncoded();
        } finally {
            spec.clearPassword();
        }

        return ITERATIONS + ":" +
            Base64.getEncoder().encodeToString(salt) +
            ":" +
            Base64.getEncoder().encodeToString(hash);
    }
}
