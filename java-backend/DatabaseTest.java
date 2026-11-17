
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

public class DatabaseTest {

    public static void main(String[] args) {

        String url = "jdbc:postgresql://localhost:5432/mediconnect_db";
        String username = "postgres";
        String password = System.getenv("MEDICONNECT_DB_PASSWORD");

        if (password == null || password.isBlank()) {
            System.out.println("Database password is missing.");
            return;
        }

        try (
            Connection connection = DriverManager.getConnection(
                url, username, password
            );
            Statement statement = connection.createStatement();
            ResultSet result = statement.executeQuery(
                "SELECT id, name, specialty, fee FROM doctors ORDER BY id"
            )
        ) {
            System.out.println("Connected to PostgreSQL!");

            while (result.next()) {
                System.out.println(
                    result.getInt("id") + " - " +
                    result.getString("name") + " - " +
                    result.getString("specialty") + " - Rs." +
                    result.getInt("fee")
                );
            }

        } catch (Exception e) {
            System.out.println("Database connection failed!");
            System.out.println(e.getMessage());
        }
    }
}
