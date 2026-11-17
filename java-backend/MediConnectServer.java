
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.sql.*;
import java.time.*;
import java.util.*;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

public class MediConnectServer {

    private static final String DB_URL =
        "jdbc:postgresql://localhost:5432/mediconnect_db";
    private static final String DB_USER = "postgres";
    private static String dbPassword;

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int ITERATIONS = 210000;

    public static void main(String[] args) throws Exception {
        dbPassword = System.getenv("MEDICONNECT_DB_PASSWORD");

        if (dbPassword == null || dbPassword.isBlank()) {
            System.err.println("Set MEDICONNECT_DB_PASSWORD first.");
            return;
        }

        HttpServer server = HttpServer.create(
            new InetSocketAddress("127.0.0.1", 8080), 0
        );

        // Health
        server.createContext("/api/health",
            e -> handle(e, () -> {
                requireMethod(e, "GET");
                send(e, 200, "{\"status\":\"success\"}");
            }));

        // Patient
        server.createContext("/api/register",
            e -> handle(e, () -> register(e)));
        server.createContext("/api/login",
            e -> handle(e, () -> login(e)));
        server.createContext("/api/logout",
            e -> handle(e, () -> logout(e)));
        server.createContext("/api/me",
            e -> handle(e, () -> me(e)));
        server.createContext("/api/doctors",
            e -> handle(e, () -> doctors(e)));
        server.createContext("/api/appointments",
            e -> handle(e, () -> appointments(e)));

        // Doctor
        server.createContext("/api/doctor/login",
            e -> handle(e, () -> doctorLogin(e)));
        server.createContext("/api/doctor/me",
            e -> handle(e, () -> doctorMe(e)));
        server.createContext("/api/doctor/appointments",
            e -> handle(e, () -> doctorAppointments(e)));

        // Doctor marks appointment completed
        server.createContext("/api/doctor/appointments/complete",
            e -> handle(e, () -> doctorCompleteAppointment(e)));

        server.createContext("/api/doctor/logout",
            e -> handle(e, () -> doctorLogout(e)));

        // Medical reports (doctor and patient)
        server.createContext("/api/doctor/reports",
            e -> handle(e, () -> doctorReports(e)));
        server.createContext("/api/patient/reports",
            e -> handle(e, () -> patientReports(e)));

        // Admin
        server.createContext("/api/admin/login",
            e -> handle(e, () -> adminLogin(e)));
        server.createContext("/api/admin/me",
            e -> handle(e, () -> adminMe(e)));
        server.createContext("/api/admin/logout",
            e -> handle(e, () -> adminLogout(e)));

        server.createContext("/api/admin/doctors/add",
            e -> handle(e, () -> adminAddNewDoctor(e)));

        server.createContext("/api/admin/doctors/create-account",
            e -> handle(e, () -> adminCreateDoctor(e)));
        server.createContext("/api/admin/doctors/reset-password",
            e -> handle(e, () -> adminResetDoctorPassword(e)));
        server.createContext("/api/admin/doctors/set-active",
            e -> handle(e, () -> adminSetDoctorActive(e)));

        server.createContext("/api/admin/doctors",
            e -> handle(e, () -> adminDoctors(e)));

        server.createContext("/api/patient/reports/analyze",
            e -> handle(e, () -> analyzePatientReport(e)));

        server.start();
        System.out.println(
            "MediConnect backend running at " +
            "http://localhost:8080/api/health"
        );
    }

    // GENERAL HELPERS

    interface Action {
        void run() throws Exception;
    }

    static class ApiError extends Exception {
        final int status;

        ApiError(int status, String message) {
            super(message);
            this.status = status;
        }
    }

    private static void handle(HttpExchange e, Action action)
        throws IOException {

        cors(e);

        if ("OPTIONS".equals(e.getRequestMethod())) {
            e.sendResponseHeaders(204, -1);
            e.close();
            return;
        }

        try {
            action.run();
        } catch (ApiError ex) {
            send(e, ex.status,
                "{\"error\":\"" + esc(ex.getMessage()) + "\"}");
        } catch (Exception ex) {
            ex.printStackTrace();
            send(e, 500,
                "{\"error\":\"Internal server error\"}");
        }
    }

    private static void cors(HttpExchange e) {
        e.getResponseHeaders().set(
            "Access-Control-Allow-Origin",
            "http://localhost:3000"
        );
        e.getResponseHeaders().set(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization"
        );
        e.getResponseHeaders().set(
            "Access-Control-Allow-Methods",
            "GET, POST, PATCH, OPTIONS"
        );
        e.getResponseHeaders().set("Cache-Control", "no-store");
        e.getResponseHeaders().set(
            "X-Content-Type-Options", "nosniff"
        );
    }

    private static void requireMethod(
        HttpExchange e, String method
    ) throws ApiError {
        if (!e.getRequestMethod().equals(method)) {
            throw new ApiError(405, "Method not allowed");
        }
    }

    private static void send(
        HttpExchange e, int status, String json
    ) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        e.getResponseHeaders().set(
            "Content-Type", "application/json; charset=utf-8"
        );
        e.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = e.getResponseBody()) {
            out.write(bytes);
        }
    }

    private static Connection db() throws SQLException {
        return DriverManager.getConnection(
            DB_URL, DB_USER, dbPassword
        );
    }

    private static String esc(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    private static Map<String, String> form(HttpExchange e)
        throws Exception {

        String type = e.getRequestHeaders()
            .getFirst("Content-Type");

        if (type == null ||
            !type.toLowerCase(Locale.ROOT)
                .startsWith("application/x-www-form-urlencoded")) {
            throw new ApiError(
                415, "Use application/x-www-form-urlencoded"
            );
        }

        byte[] bytes = e.getRequestBody().readNBytes(8193);

        if (bytes.length > 8192) {
            throw new ApiError(413, "Form too large");
        }

        Map<String, String> result = new HashMap<>();

        for (String pair :
            new String(bytes, StandardCharsets.UTF_8).split("&")) {

            String[] parts = pair.split("=", 2);

            if (parts.length == 2) {
                result.put(
                    URLDecoder.decode(
                        parts[0], StandardCharsets.UTF_8),
                    URLDecoder.decode(
                        parts[1], StandardCharsets.UTF_8)
                );
            }
        }
        return result;
    }

    private static String val(
        Map<String, String> m, String key
    ) {
        return m.getOrDefault(key, "").trim();
    }

    private static String sha256(String input)
        throws Exception {

        byte[] bytes = MessageDigest.getInstance("SHA-256")
            .digest(input.getBytes(StandardCharsets.UTF_8));

        return HexFormat.of().formatHex(bytes);
    }

    private static byte[] derive(
        char[] password, byte[] salt, int iterations
    ) throws Exception {

        PBEKeySpec spec = new PBEKeySpec(
            password, salt, iterations, 256
        );

        try {
            return SecretKeyFactory.getInstance(
                "PBKDF2WithHmacSHA256"
            ).generateSecret(spec).getEncoded();
        } finally {
            spec.clearPassword();
        }
    }

    private static String hashPassword(String password)
        throws Exception {

        byte[] salt = new byte[16];
        RANDOM.nextBytes(salt);
        char[] chars = password.toCharArray();

        try {
            return "pbkdf2:" + ITERATIONS + ":" +
                Base64.getEncoder().encodeToString(salt) + ":" +
                Base64.getEncoder().encodeToString(
                    derive(chars, salt, ITERATIONS)
                );
        } finally {
            Arrays.fill(chars, '\0');
        }
    }

    private static boolean verifyPassword(
        String password, String stored
    ) throws Exception {

        if (stored == null || password == null) return false;

        String[] p = stored.split(":");
        int iterations;
        String saltString;
        String hashString;

        try {
            if (p.length == 4 && p[0].equals("pbkdf2")) {
                iterations = Integer.parseInt(p[1]);
                saltString = p[2];
                hashString = p[3];
            } else if (p.length == 3) {
                iterations = Integer.parseInt(p[0]);
                saltString = p[1];
                hashString = p[2];
            } else {
                return false;
            }

            if (iterations < 100000 || iterations > 1000000) {
                return false;
            }

            byte[] salt = Base64.getDecoder().decode(saltString);
            byte[] expected =
                Base64.getDecoder().decode(hashString);

            if (salt.length != 16 || expected.length != 32) {
                return false;
            }

            char[] chars = password.toCharArray();

            try {
                byte[] actual = derive(
                    chars, salt, iterations
                );
                return MessageDigest.isEqual(actual, expected);
            } finally {
                Arrays.fill(chars, '\0');
            }
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    private static boolean strongPassword(String p) {
        return p.length() >= 8 &&
            p.length() <= 128 &&
            p.matches("(?s).*\\p{L}.*") &&
            p.matches("(?s).*\\d.*") &&
            p.matches("(?s).*[\\p{P}\\p{S}].*");
    }

    private static boolean strongAdminPassword(String p) {
        return p.length() >= 12 &&
            p.length() <= 128 &&
            p.matches("(?s).*\\p{Lu}.*") &&
            p.matches("(?s).*\\p{Ll}.*") &&
            p.matches("(?s).*\\d.*") &&
            p.matches("(?s).*[\\p{P}\\p{S}].*");
    }

    private static String newToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);

        return Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(bytes);
    }

    private static String bearer(HttpExchange e)
        throws ApiError {

        String header = e.getRequestHeaders()
            .getFirst("Authorization");

        if (header == null ||
            !header.startsWith("Bearer ") ||
            header.length() <= 7 ||
            header.length() > 256) {
            throw new ApiError(401, "Please log in");
        }

        return header.substring(7);
    }

    private static String createSession(
        Connection c,
        String table,
        String idColumn,
        long id,
        Duration duration
    ) throws Exception {

        String token = newToken();

        String sql =
            "INSERT INTO " + table +
            " (token_hash," + idColumn + ",expires_at) " +
            "VALUES (?,?,?)";

        try (PreparedStatement p = c.prepareStatement(sql)) {
            p.setString(1, sha256(token));
            p.setLong(2, id);
            p.setTimestamp(
                3,
                java.sql.Timestamp.from(
                    Instant.now().plus(duration)
                )
            );
            p.executeUpdate();
        }

        return token;
    }

    private static void deleteSession(
        String table, String token
    ) throws Exception {

        try (
            Connection c = db();
            PreparedStatement p = c.prepareStatement(
                "DELETE FROM " + table + " WHERE token_hash=?"
            )
        ) {
            p.setString(1, sha256(token));
            p.executeUpdate();
        }
    }

    // ============================================
    // PATIENT ACCOUNT
    // ============================================

    private static class Patient {
        long id;
        String name;
        String email;

        Patient(long id, String name, String email) {
            this.id = id;
            this.name = name;
            this.email = email;
        }
    }

    private static Patient auth(HttpExchange e)
        throws Exception {

        String token = bearer(e);

        try (
            Connection c = db();
            PreparedStatement p = c.prepareStatement(
                "SELECT p.id,p.name,p.email " +
                "FROM patient_sessions s " +
                "JOIN patients p ON p.id=s.patient_id " +
                "WHERE s.token_hash=? AND s.expires_at>NOW()"
            )
        ) {
            p.setString(1, sha256(token));

            try (ResultSet r = p.executeQuery()) {
                if (!r.next()) {
                    throw new ApiError(
                        401, "Session expired. Please log in again"
                    );
                }

                return new Patient(
                    r.getLong("id"),
                    r.getString("name"),
                    r.getString("email")
                );
            }
        }
    }

    private static void register(HttpExchange e)
        throws Exception {

        requireMethod(e, "POST");

        Map<String, String> m = form(e);

        String name = val(m, "name");
        String email = val(m, "email")
            .toLowerCase(Locale.ROOT);
        String password = m.getOrDefault("password", "");

        if (name.isBlank() || name.length() > 150 ||
            email.length() > 255 ||
            !email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) {
            throw new ApiError(
                400, "Enter a valid name and email"
            );
        }

        if (!strongPassword(password)) {
            throw new ApiError(
                400,
                "Password needs 8+ characters, a letter, " +
                "number and special character"
            );
        }

        try (
            Connection c = db();
            PreparedStatement p = c.prepareStatement(
                "INSERT INTO patients " +
                "(name,email,password_hash) " +
                "VALUES (?,?,?) RETURNING id"
            )
        ) {
            p.setString(1, name);
            p.setString(2, email);
            p.setString(3, hashPassword(password));

            try (ResultSet r = p.executeQuery()) {
                r.next();

                long id = r.getLong(1);
                String token = createSession(
                    c, "patient_sessions", "patient_id",
                    id, Duration.ofDays(1)
                );

                send(e, 201,
                    "{\"token\":\"" + esc(token) +
                    "\",\"user\":{\"id\":" + id +
                    ",\"name\":\"" + esc(name) +
                    "\",\"email\":\"" + esc(email) +
                    "\"}}"
                );
            }

        } catch (SQLException ex) {
            if ("23505".equals(ex.getSQLState())) {
                throw new ApiError(
                    409, "Email already registered"
                );
            }
            throw ex;
        }
    }

    private static void login(HttpExchange e)
        throws Exception {

        requireMethod(e, "POST");

        Map<String, String> m = form(e);
        String email = val(m, "email")
            .toLowerCase(Locale.ROOT);
        String password = m.getOrDefault("password", "");

        try (
            Connection c = db();
            PreparedStatement p = c.prepareStatement(
                "SELECT id,name,email,password_hash " +
                "FROM patients WHERE LOWER(email)=?"
            )
        ) {
            p.setString(1, email);

            try (ResultSet r = p.executeQuery()) {
                if (!r.next() ||
                    !verifyPassword(
                        password,
                        r.getString("password_hash")
                    )) {
                    throw new ApiError(
                        401, "Invalid email or password"
                    );
                }

                long id = r.getLong("id");

                String token = createSession(
                    c, "patient_sessions", "patient_id",
                    id, Duration.ofDays(1)
                );

                send(e, 200,
                    "{\"token\":\"" + esc(token) +
                    "\",\"user\":{\"id\":" + id +
                    ",\"name\":\"" +
                    esc(r.getString("name")) +
                    "\",\"email\":\"" +
                    esc(r.getString("email")) +
                    "\"}}"
                );
            }
        }
    }

    private static void me(HttpExchange e)
        throws Exception {

        requireMethod(e, "GET");
        Patient p = auth(e);

        send(e, 200,
            "{\"id\":" + p.id +
            ",\"name\":\"" + esc(p.name) +
            "\",\"email\":\"" + esc(p.email) +
            "\"}"
        );
    }

    private static void logout(HttpExchange e)
        throws Exception {

        requireMethod(e, "POST");
        deleteSession("patient_sessions", bearer(e));
        send(e, 200, "{\"message\":\"Logged out\"}");
    }

    // ============================================
    // PUBLIC DOCTOR LIST
    // ============================================

    private static void doctors(HttpExchange e)
        throws Exception {

        requireMethod(e, "GET");

        try (
            Connection c = db();
            PreparedStatement p = c.prepareStatement(
                "SELECT id,name,specialty,experience,fee " +
                "FROM doctors ORDER BY id"
            );
            ResultSet r = p.executeQuery()
        ) {
            StringBuilder b = new StringBuilder("[");
            boolean first = true;

            while (r.next()) {
                if (!first) b.append(',');
                first = false;

                b.append("{\"id\":")
                 .append(r.getLong("id"))
                 .append(",\"name\":\"")
                 .append(esc(r.getString("name")))
                 .append("\",\"specialty\":\"")
                 .append(esc(r.getString("specialty")))
                 .append("\",\"experience\":\"")
                 .append(esc(r.getString("experience")))
                 .append("\",\"fee\":")
                 .append(r.getInt("fee"))
                 .append("}");
            }

            send(e, 200, b.append("]").toString());
        }
    }

    // ============================================
    // PATIENT APPOINTMENTS
    // ============================================

    private static void appointments(HttpExchange e)
        throws Exception {

        Patient patient = auth(e);

        switch (e.getRequestMethod()) {
            case "GET" -> getAppointments(e, patient);
            case "POST" -> book(e, patient);
            case "PATCH" -> cancel(e, patient);
            default -> throw new ApiError(
                405, "Method not allowed"
            );
        }
    }

    private static void getAppointments(
        HttpExchange e, Patient patient
    ) throws Exception {

        String sql =
            "SELECT a.id,a.patient_id,a.patient_name," +
            "a.patient_email,a.doctor_id," +
            "d.name AS doctor_name," +
            "a.appointment_date,a.appointment_time,a.status " +
            "FROM appointments a " +
            "JOIN doctors d ON d.id=a.doctor_id " +
            "WHERE a.patient_id=? " +
            "ORDER BY a.id DESC";

        try (
            Connection c = db();
            PreparedStatement p = c.prepareStatement(sql)
        ) {
            p.setLong(1, patient.id);

            try (ResultSet r = p.executeQuery()) {
                StringBuilder b = new StringBuilder("[");
                boolean first = true;

                while (r.next()) {
                    if (!first) b.append(',');
                    first = false;

                    boolean mine =
                        r.getObject("patient_id") != null &&
                        r.getLong("patient_id") == patient.id;

                    b.append("{\"id\":")
                     .append(r.getLong("id"))
                     .append(",\"doctorId\":")
                     .append(r.getLong("doctor_id"))
                     .append(",\"date\":\"")
                     .append(r.getDate("appointment_date"))
                     .append("\",\"time\":\"")
                     .append(r.getTime("appointment_time"))
                     .append("\",\"status\":\"")
                     .append(esc(r.getString("status")))
                     .append("\",\"mine\":")
                     .append(mine);

                    if (mine) {
                        b.append(",\"patientName\":\"")
                         .append(esc(r.getString("patient_name")))
                         .append("\",\"patientEmail\":\"")
                         .append(esc(r.getString("patient_email")))
                         .append("\",\"doctorName\":\"")
                         .append(esc(r.getString("doctor_name")))
                         .append("\"");
                    }

                    b.append("}");
                }

                send(e, 200, b.append("]").toString());
            }
        }
    }

    private static void book(
        HttpExchange e, Patient patient
    ) throws Exception {

        Map<String, String> m = form(e);

        int doctorId;
        java.sql.Date date;
        Time time;

        try {
            doctorId = Integer.parseInt(val(m, "doctorId"));
            date = java.sql.Date.valueOf(val(m, "date"));

            String timeValue = val(m, "time");

            if (timeValue.matches("\\d{2}:\\d{2}")) {
                timeValue += ":00";
            }

            time = Time.valueOf(timeValue);

            if (doctorId <= 0 ||
                !LocalDateTime.of(
                    date.toLocalDate(),
                    time.toLocalTime()
                ).isAfter(LocalDateTime.now())) {
                throw new IllegalArgumentException();
            }

        } catch (IllegalArgumentException ex) {
            throw new ApiError(
                400,
                "Select a valid future appointment date and time"
            );
        }

        try (
            Connection c = db();
            PreparedStatement p = c.prepareStatement(
                "INSERT INTO appointments " +
                "(patient_id,patient_name,patient_email," +
                "doctor_id,appointment_date,appointment_time,status) " +
                "VALUES (?,?,?,?,?,?,'Booked') RETURNING id"
            )
        ) {
            p.setLong(1, patient.id);
            p.setString(2, patient.name);
            p.setString(3, patient.email);
            p.setInt(4, doctorId);
            p.setDate(5, date);
            p.setTime(6, time);

            try (ResultSet r = p.executeQuery()) {
                r.next();

                send(e, 201,
                    "{\"message\":\"Appointment booked\"," +
                    "\"appointmentId\":" + r.getLong(1) + "}"
                );
            }

        } catch (SQLException ex) {
            if ("23505".equals(ex.getSQLState())) {
                throw new ApiError(
                    409, "This slot is already booked"
                );
            }

            if ("23503".equals(ex.getSQLState())) {
                throw new ApiError(
                    400, "Doctor does not exist"
                );
            }

            throw ex;
        }
    }

    private static void cancel(
        HttpExchange e, Patient patient
    ) throws Exception {

        Map<String, String> m = form(e);
        int id;

        try {
            id = Integer.parseInt(val(m, "appointmentId"));

            if (id <= 0) {
                throw new NumberFormatException();
            }

        } catch (NumberFormatException ex) {
            throw new ApiError(
                400, "Invalid appointment ID"
            );
        }

        try (
            Connection c = db();
            PreparedStatement p = c.prepareStatement(
                "UPDATE appointments SET status='Cancelled' " +
                "WHERE id=? AND patient_id=? AND status='Booked'"
            )
        ) {
            p.setInt(1, id);
            p.setLong(2, patient.id);

            if (p.executeUpdate() == 0) {
                throw new ApiError(
                    404,
                    "Active appointment not found for your account"
                );
            }

            send(e, 200,
                "{\"message\":\"Appointment cancelled\"}");
        }
    }

    // ============================================
    // DOCTOR AUTHENTICATION
    // ============================================

    private static class DoctorAccount {

        long id;
        String name;
        String specialty;
        String email;

        DoctorAccount(
            long id,
            String name,
            String specialty,
            String email
        ) {
            this.id = id;
            this.name = name;
            this.specialty = specialty;
            this.email = email;
        }
    }

    // ============================================
    // VERIFY DOCTOR SESSION
    // ============================================

    private static DoctorAccount doctorAuth(
        HttpExchange e
    ) throws Exception {

        String token = bearer(e);

        try (
            Connection c = db();

            PreparedStatement p = c.prepareStatement(
                "SELECT d.id,d.name,d.specialty,da.email " +
                "FROM doctor_sessions ds " +
                "JOIN doctor_accounts da " +
                "ON da.doctor_id=ds.doctor_id " +
                "JOIN doctors d ON d.id=da.doctor_id " +
                "WHERE ds.token_hash=? " +
                "AND ds.expires_at>NOW() " +
                "AND da.active=TRUE"
            )
        ) {

            p.setString(1, sha256(token));

            try (ResultSet r = p.executeQuery()) {

                if (!r.next()) {
                    throw new ApiError(
                        401,
                        "Doctor session expired. Please log in again"
                    );
                }

                return new DoctorAccount(
                    r.getLong("id"),
                    r.getString("name"),
                    r.getString("specialty"),
                    r.getString("email")
                );
            }
        }
    }

    // ============================================
    // DOCTOR LOGIN
    // ============================================

    private static void doctorLogin(
        HttpExchange e
    ) throws Exception {

        requireMethod(e, "POST");

        Map<String, String> m = form(e);

        String email = val(m, "email")
            .toLowerCase(Locale.ROOT);

        String password = m.getOrDefault("password", "");

        try (
            Connection c = db();

            PreparedStatement p = c.prepareStatement(
                "SELECT da.doctor_id,da.password_hash," +
                "d.name,d.specialty " +
                "FROM doctor_accounts da " +
                "JOIN doctors d ON d.id=da.doctor_id " +
                "WHERE LOWER(da.email)=? " +
                "AND da.active=TRUE"
            )
        ) {

            p.setString(1, email);

            long doctorId;
            String name;
            String specialty;

            try (ResultSet r = p.executeQuery()) {

                if (!r.next() ||
                    !verifyPassword(
                        password,
                        r.getString("password_hash")
                    )) {

                    throw new ApiError(
                        401,
                        "Invalid doctor email or password"
                    );
                }

                doctorId = r.getLong("doctor_id");
                name = r.getString("name");
                specialty = r.getString("specialty");
            }

            String token = createSession(
                c,
                "doctor_sessions",
                "doctor_id",
                doctorId,
                Duration.ofDays(1)
            );

            send(
                e,
                200,
                "{\"token\":\"" + esc(token) +
                "\",\"doctor\":{\"id\":" + doctorId +
                ",\"name\":\"" + esc(name) +
                "\",\"specialty\":\"" + esc(specialty) +
                "\",\"email\":\"" + esc(email) +
                "\"}}"
            );
        }
    }

    // ============================================
    // GET LOGGED-IN DOCTOR PROFILE
    // ============================================

    private static void doctorMe(
        HttpExchange e
    ) throws Exception {

        requireMethod(e, "GET");

        DoctorAccount doctor = doctorAuth(e);

        send(
            e,
            200,
            "{\"id\":" + doctor.id +
            ",\"name\":\"" + esc(doctor.name) +
            "\",\"specialty\":\"" + esc(doctor.specialty) +
            "\",\"email\":\"" + esc(doctor.email) +
            "\"}"
        );
    }

    // ============================================
    // GET DOCTOR APPOINTMENTS
    // ============================================

    private static void doctorAppointments(
        HttpExchange e
    ) throws Exception {

        requireMethod(e, "GET");

        DoctorAccount doctor = doctorAuth(e);

        try (
            Connection c = db();

            PreparedStatement p = c.prepareStatement(
                "SELECT id,patient_name,patient_email," +
                "appointment_date,appointment_time,status " +
                "FROM appointments " +
                "WHERE doctor_id=? " +
                "ORDER BY appointment_date DESC," +
                "appointment_time DESC,id DESC"
            )
        ) {

            p.setLong(1, doctor.id);

            try (ResultSet r = p.executeQuery()) {

                StringBuilder b = new StringBuilder("[");

                boolean first = true;

                while (r.next()) {

                    if (!first) {
                        b.append(",");
                    }

                    first = false;

                    b.append("{\"id\":")
                     .append(r.getLong("id"))

                     .append(",\"patientName\":\"")
                     .append(esc(r.getString("patient_name")))

                     .append("\",\"patientEmail\":\"")
                     .append(esc(r.getString("patient_email")))

                     .append("\",\"date\":\"")
                     .append(r.getDate("appointment_date"))

                     .append("\",\"time\":\"")
                     .append(r.getTime("appointment_time"))

                     .append("\",\"status\":\"")
                     .append(esc(r.getString("status")))

                     .append("\"}");
                }

                send(
                    e,
                    200,
                    b.append("]").toString()
                );
            }
        }
    }

    // ============================================
    // DOCTOR MARKS APPOINTMENT AS COMPLETED
    // ============================================

    private static void doctorCompleteAppointment(
        HttpExchange e
    ) throws Exception {

        // Only POST requests are allowed
        requireMethod(e, "POST");

        // Verify doctor is logged in
        DoctorAccount doctor = doctorAuth(e);

        // Read appointment ID from request
        Map<String, String> m = form(e);

        long appointmentId;

        try {

            appointmentId = Long.parseLong(
                val(m, "appointmentId")
            );

            if (appointmentId <= 0) {
                throw new NumberFormatException();
            }

        } catch (NumberFormatException ex) {

            throw new ApiError(
                400,
                "Invalid appointment ID"
            );
        }

        try (
            Connection c = db();

            PreparedStatement p = c.prepareStatement(
                "UPDATE appointments " +
                "SET status='Completed' " +
                "WHERE id=? " +
                "AND doctor_id=? " +
                "AND status='Booked'"
            )
        ) {

            p.setLong(1, appointmentId);

            p.setLong(2, doctor.id);

            int updated = p.executeUpdate();

            if (updated == 0) {

                throw new ApiError(
                    404,
                    "Booked appointment not found for this doctor"
                );
            }

            send(
                e,
                200,
                "{\"message\":\"Appointment marked as Completed\"}"
            );
        }
    }

    // ============================================
    // MEDICAL REPORTS
    // ============================================

    private static long reportAppointmentId(Map<String, String> m)
        throws ApiError {
        try {
            long id = Long.parseLong(val(m, "appointmentId"));
            if (id <= 0) throw new NumberFormatException();
            return id;
        } catch (NumberFormatException ex) {
            throw new ApiError(400, "Invalid appointment ID");
        }
    }

    private static void doctorReports(HttpExchange e) throws Exception {
        DoctorAccount doctor = doctorAuth(e);
        switch (e.getRequestMethod()) {
            case "GET" -> listDoctorReports(e, doctor);
            case "POST" -> saveDoctorReport(e, doctor);
            default -> throw new ApiError(405, "Method not allowed");
        }
    }

    private static void saveDoctorReport(
        HttpExchange e, DoctorAccount doctor
    ) throws Exception {
        Map<String, String> m = form(e);
        long appointmentId = reportAppointmentId(m);
        String symptoms = val(m, "symptoms");
        String diagnosis = val(m, "diagnosis");
        String medicines = val(m, "medicines");
        String advice = val(m, "advice");

        if (symptoms.isBlank() || symptoms.length() > 2000 ||
            diagnosis.length() > 2000 || medicines.length() > 4000 ||
            advice.length() > 4000) {
            throw new ApiError(400, "Invalid report details");
        }

        String sql =
            "INSERT INTO medical_reports " +
            "(appointment_id,patient_id,doctor_id,symptoms,diagnosis,medicines,advice) " +
            "SELECT a.id,a.patient_id,a.doctor_id,?,?,?,? " +
            "FROM appointments a WHERE a.id=? AND a.doctor_id=? " +
            "AND a.patient_id IS NOT NULL AND a.status='Completed' " +
            "AND NOT EXISTS (SELECT 1 FROM medical_reports mr " +
            "WHERE mr.appointment_id=a.id) RETURNING id";
        try (Connection c = db();
             PreparedStatement p = c.prepareStatement(sql)) {
            p.setString(1, symptoms);
            p.setString(2, diagnosis);
            p.setString(3, medicines);
            p.setString(4, advice);
            p.setLong(5, appointmentId);
            p.setLong(6, doctor.id);
            try (ResultSet r = p.executeQuery()) {
                if (!r.next()) {
                    throw new ApiError(409,
                        "Appointment must be completed and assigned to you, " +
                        "and must not already have a report");
                }
                send(e, 201, "{\"message\":\"Medical report saved successfully\"," +
                    "\"reportId\":" + r.getLong(1) + "}");
            }
        } catch (SQLException ex) {
            if ("23505".equals(ex.getSQLState())) {
                throw new ApiError(409, "A report already exists for this appointment");
            }
            throw ex;
        }
    }

    private static void listDoctorReports(
        HttpExchange e, DoctorAccount doctor
    ) throws Exception {
        String sql =
            "SELECT mr.id,mr.appointment_id,mr.symptoms,mr.diagnosis," +
            "mr.medicines,mr.advice,mr.created_at," +
            "p.name AS patient_name,d.name AS doctor_name " +
            "FROM medical_reports mr " +
            "JOIN patients p ON p.id=mr.patient_id " +
            "JOIN doctors d ON d.id=mr.doctor_id " +
            "WHERE mr.doctor_id=? ORDER BY mr.created_at DESC,mr.id DESC";
        try (Connection c = db();
             PreparedStatement p = c.prepareStatement(sql)) {
            p.setLong(1, doctor.id);
            try (ResultSet r = p.executeQuery()) {
                send(e, 200, reportJson(r));
            }
        }
    }

    private static void patientReports(HttpExchange e) throws Exception {
        requireMethod(e, "GET");
        Patient patient = auth(e);
        String sql =
            "SELECT mr.id,mr.appointment_id,mr.symptoms,mr.diagnosis," +
            "mr.medicines,mr.advice,mr.created_at," +
            "p.name AS patient_name,d.name AS doctor_name " +
            "FROM medical_reports mr " +
            "JOIN patients p ON p.id=mr.patient_id " +
            "JOIN doctors d ON d.id=mr.doctor_id " +
            "WHERE mr.patient_id=? ORDER BY mr.created_at DESC,mr.id DESC";
        try (Connection c = db();
             PreparedStatement p = c.prepareStatement(sql)) {
            p.setLong(1, patient.id);
            try (ResultSet r = p.executeQuery()) {
                send(e, 200, reportJson(r));
            }
        }
    }

    private static String reportJson(ResultSet r) throws SQLException {
        StringBuilder b = new StringBuilder("[");
        boolean first = true;
        while (r.next()) {
            if (!first) b.append(',');
            first = false;
            b.append("{\"id\":").append(r.getLong("id"))
             .append(",\"appointmentId\":").append(r.getLong("appointment_id"))
             .append(",\"patientName\":\"").append(esc(r.getString("patient_name")))
             .append("\",\"doctorName\":\"").append(esc(r.getString("doctor_name")))
             .append("\",\"createdAt\":\"").append(esc(r.getString("created_at")))
             .append("\",\"symptoms\":\"").append(esc(r.getString("symptoms")))
             .append("\",\"diagnosis\":\"").append(esc(r.getString("diagnosis")))
             .append("\",\"medicines\":\"").append(esc(r.getString("medicines")))
             .append("\",\"advice\":\"").append(esc(r.getString("advice")))
             .append("\"}");
        }
        return b.append(']').toString();
    }

    // ============================================
    // DOCTOR LOGOUT
    // ============================================

    private static void doctorLogout(
        HttpExchange e
    ) throws Exception {

        requireMethod(e, "POST");

        deleteSession(
            "doctor_sessions",
            bearer(e)
        );

        send(
            e,
            200,
            "{\"message\":\"Doctor logged out successfully\"}"
        );
    }

    // END OF PART 3
    // DO NOT CLOSE THE MEDICONNECTSERVER CLASS HERE
    // PART 4 WILL CONTINUE BELOW

    // ============================================
    // Analyze an authenticated patient's own saved report using local AI service.
    private static void analyzePatientReport(HttpExchange e) throws Exception {
        requireMethod(e, "POST");
        Patient patient = auth(e);
        Map<String, String> fields = form(e);
        long reportId;
        try {
            reportId = Long.parseLong(val(fields, "reportId"));
            if (reportId <= 0) throw new NumberFormatException();
        } catch (NumberFormatException ex) {
            throw new ApiError(400, "Invalid report ID");
        }

        String sql = "SELECT symptoms, diagnosis, medicines, advice " +
                     "FROM medical_reports WHERE id=? AND patient_id=?";
        String symptoms, diagnosis, medicines, advice;
        try (Connection c = db();
             PreparedStatement p = c.prepareStatement(sql)) {
            p.setLong(1, reportId);
            p.setLong(2, patient.id);
            try (ResultSet r = p.executeQuery()) {
                if (!r.next()) throw new ApiError(404, "Medical report not found");
                symptoms = r.getString("symptoms");
                diagnosis = r.getString("diagnosis");
                medicines = r.getString("medicines");
                advice = r.getString("advice");
            }
        }

        String key = System.getenv("MEDICONNECT_AI_INTERNAL_KEY");
        if (key == null || key.isBlank()) {
            throw new ApiError(503, "AI connection not configured");
        }
        String body = "symptoms=" + URLEncoder.encode(
            symptoms == null ? "" : symptoms, StandardCharsets.UTF_8) +
            "&diagnosis=" + URLEncoder.encode(
            diagnosis == null ? "" : diagnosis, StandardCharsets.UTF_8) +
            "&medicines=" + URLEncoder.encode(
            medicines == null ? "" : medicines, StandardCharsets.UTF_8) +
            "&advice=" + URLEncoder.encode(
            advice == null ? "" : advice, StandardCharsets.UTF_8);

        java.net.http.HttpClient client = java.net.http.HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10)).build();
        java.net.http.HttpRequest request = java.net.http.HttpRequest.newBuilder()
            .uri(URI.create("http://127.0.0.1:8010/analyze-saved-report"))
            .timeout(Duration.ofSeconds(90))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .header("X-Internal-Key", key)
            .POST(java.net.http.HttpRequest.BodyPublishers.ofString(body))
            .build();
        java.net.http.HttpResponse<String> response;
        try {
            response = client.send(request,
                java.net.http.HttpResponse.BodyHandlers.ofString());
        } catch (Exception ex) {
            throw new ApiError(502, "AI service is unavailable");
        }
        if (response.statusCode() != 200) {
            throw new ApiError(502, "AI analysis failed");
        }
        e.getResponseHeaders().set("Cache-Control", "no-store");
        send(e, 200, response.body());
    }

    // ADMIN AUTHENTICATION
    // ============================================

    private static class AdminAccount {

        long id;
        String email;

        AdminAccount(long id, String email) {
            this.id = id;
            this.email = email;
        }
    }

    // ============================================
    // VERIFY ADMIN SESSION
    // ============================================

    private static AdminAccount adminAuth(
        HttpExchange e
    ) throws Exception {

        String token = bearer(e);

        try (
            Connection c = db();

            PreparedStatement p = c.prepareStatement(
                "SELECT a.id,a.email " +
                "FROM admin_sessions s " +
                "JOIN admin_accounts a ON a.id=s.admin_id " +
                "WHERE s.token_hash=? " +
                "AND s.expires_at>NOW() " +
                "AND a.active=TRUE"
            )
        ) {

            p.setString(1, sha256(token));

            try (ResultSet r = p.executeQuery()) {

                if (!r.next()) {
                    throw new ApiError(
                        401,
                        "Administrator session expired"
                    );
                }

                return new AdminAccount(
                    r.getLong("id"),
                    r.getString("email")
                );
            }
        }
    }

    // ============================================
    // ADMIN LOGIN
    // ============================================

    private static void adminLogin(
        HttpExchange e
    ) throws Exception {

        requireMethod(e, "POST");

        Map<String, String> m = form(e);

        String email = val(m, "email")
            .toLowerCase(Locale.ROOT);

        String password = m.getOrDefault("password", "");

        if (email.length() > 255 || password.length() > 256) {
            throw new ApiError(
                400,
                "Invalid credentials"
            );
        }

        try (
            Connection c = db();

            PreparedStatement p = c.prepareStatement(
                "SELECT id,email,password_hash " +
                "FROM admin_accounts " +
                "WHERE LOWER(email)=? AND active=TRUE"
            )
        ) {

            p.setString(1, email);

            long adminId;
            String adminEmail;

            try (ResultSet r = p.executeQuery()) {

                if (!r.next() ||
                    !verifyPassword(
                        password,
                        r.getString("password_hash")
                    )) {

                    throw new ApiError(
                        401,
                        "Invalid administrator email or password"
                    );
                }

                adminId = r.getLong("id");
                adminEmail = r.getString("email");
            }

            String token = createSession(
                c,
                "admin_sessions",
                "admin_id",
                adminId,
                Duration.ofHours(8)
            );

            send(
                e,
                200,
                "{\"token\":\"" + esc(token) +
                "\",\"admin\":{\"id\":" + adminId +
                ",\"email\":\"" + esc(adminEmail) +
                "\"}}"
            );
        }
    }

    // ============================================
    // GET LOGGED-IN ADMIN PROFILE
    // ============================================

    private static void adminMe(
        HttpExchange e
    ) throws Exception {

        requireMethod(e, "GET");

        AdminAccount admin = adminAuth(e);

        send(
            e,
            200,
            "{\"id\":" + admin.id +
            ",\"email\":\"" + esc(admin.email) +
            "\"}"
        );
    }

    // ============================================
    // ADMIN LOGOUT
    // ============================================

    private static void adminLogout(
        HttpExchange e
    ) throws Exception {

        requireMethod(e, "POST");

        deleteSession(
            "admin_sessions",
            bearer(e)
        );

        send(
            e,
            200,
            "{\"message\":\"Logged out\"}"
        );
    }

    // ============================================
    // ADMIN VIEW ALL DOCTORS
    // ============================================

    private static void adminDoctors(
        HttpExchange e
    ) throws Exception {

        requireMethod(e, "GET");

        adminAuth(e);

        String sql =
            "SELECT d.id,d.name,d.specialty," +
            "da.email,da.active " +
            "FROM doctors d " +
            "LEFT JOIN doctor_accounts da " +
            "ON da.doctor_id=d.id " +
            "ORDER BY d.id";

        try (
            Connection c = db();

            PreparedStatement p = c.prepareStatement(sql);

            ResultSet r = p.executeQuery()
        ) {

            StringBuilder b = new StringBuilder("[");
            boolean first = true;

            while (r.next()) {

                if (!first) {
                    b.append(",");
                }

                first = false;

                String email = r.getString("email");
                boolean hasAccount = email != null;

                b.append("{\"id\":")
                 .append(r.getLong("id"))

                 .append(",\"name\":\"")
                 .append(esc(r.getString("name")))

                 .append("\",\"specialty\":\"")
                 .append(esc(r.getString("specialty")))

                 .append("\",\"email\":");

                if (hasAccount) {
                    b.append("\"")
                     .append(esc(email))
                     .append("\"");
                } else {
                    b.append("null");
                }

                b.append(",\"hasAccount\":")
                 .append(hasAccount)

                 .append(",\"active\":")
                 .append(hasAccount && r.getBoolean("active"))

                 .append("}");
            }

            send(
                e,
                200,
                b.append("]").toString()
            );
        }
    }

    // ============================================
    // VALIDATE DOCTOR ID
    // ============================================

    private static long requiredDoctorId(
        Map<String, String> m
    ) throws ApiError {

        try {

            long id = Long.parseLong(
                val(m, "doctorId")
            );

            if (id <= 0) {
                throw new NumberFormatException();
            }

            return id;

        } catch (NumberFormatException ex) {

            throw new ApiError(
                400,
                "Invalid doctor ID"
            );
        }
    }

    // ============================================
    // ADMIN ADD NEW DOCTOR
    // ============================================

    private static void adminAddNewDoctor(
        HttpExchange e
    ) throws Exception {

        requireMethod(e, "POST");

        adminAuth(e);

        Map<String, String> m = form(e);

        String name = val(m, "name");

        String specialty = val(m, "specialty");

        String experience = val(m, "experience");

        String email = val(m, "email")
            .toLowerCase(Locale.ROOT);

        String password = m.getOrDefault("password", "");

        int fee;

        try {

            fee = Integer.parseInt(
                val(m, "fee")
            );

        } catch (NumberFormatException ex) {

            throw new ApiError(
                400,
                "Invalid consultation fee"
            );
        }

        if (
            name.isBlank() ||
            name.length() > 150 ||
            specialty.isBlank() ||
            specialty.length() > 150 ||
            experience.isBlank() ||
            experience.length() > 100 ||
            fee < 0 ||
            fee > 1000000
        ) {

            throw new ApiError(
                400,
                "Invalid doctor details"
            );
        }

        if (
            email.length() > 255 ||
            !email.matches(
                "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"
            )
        ) {

            throw new ApiError(
                400,
                "Invalid doctor email"
            );
        }

        if (!strongAdminPassword(password)) {

            throw new ApiError(
                400,
                "Password needs 12+ characters, uppercase, " +
                "lowercase, number and special character"
            );
        }

        long doctorId;

        try (Connection c = db()) {

            c.setAutoCommit(false);

            try {

                // Create doctor profile

                try (
                    PreparedStatement p = c.prepareStatement(
                        "INSERT INTO doctors " +
                        "(name,specialty,experience,fee) " +
                        "VALUES (?,?,?,?) RETURNING id"
                    )
                ) {

                    p.setString(1, name);
                    p.setString(2, specialty);
                    p.setString(3, experience);
                    p.setInt(4, fee);

                    try (ResultSet r = p.executeQuery()) {

                        if (!r.next()) {
                            throw new ApiError(
                                500,
                                "Could not create doctor"
                            );
                        }

                        doctorId = r.getLong(1);
                    }
                }

                // Create doctor login account

                try (
                    PreparedStatement p = c.prepareStatement(
                        "INSERT INTO doctor_accounts " +
                        "(doctor_id,email,password_hash,active) " +
                        "VALUES (?,?,?,TRUE)"
                    )
                ) {

                    p.setLong(1, doctorId);
                    p.setString(2, email);
                    p.setString(
                        3,
                        hashPassword(password)
                    );

                    p.executeUpdate();
                }

                c.commit();

            } catch (Exception ex) {

                c.rollback();

                if (
                    ex instanceof SQLException &&
                    "23505".equals(
                        ((SQLException) ex).getSQLState()
                    )
                ) {

                    throw new ApiError(
                        409,
                        "Doctor email already exists"
                    );
                }

                throw ex;
            }
        }

        send(
            e,
            201,
            "{\"message\":\"Doctor added successfully\"," +
            "\"doctorId\":" + doctorId + "}"
        );
    }

    // ============================================
    // CREATE LOGIN FOR EXISTING DOCTOR
    // ============================================

    private static void adminCreateDoctor(
        HttpExchange e
    ) throws Exception {

        requireMethod(e, "POST");

        adminAuth(e);

        Map<String, String> m = form(e);

        long doctorId = requiredDoctorId(m);

        String email = val(m, "email")
            .toLowerCase(Locale.ROOT);

        String password = m.getOrDefault("password", "");

        if (
            email.length() > 255 ||
            !email.matches(
                "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"
            )
        ) {

            throw new ApiError(
                400,
                "Invalid doctor email"
            );
        }

        if (!strongAdminPassword(password)) {

            throw new ApiError(
                400,
                "Password needs 12+ characters, uppercase, " +
                "lowercase, number and special character"
            );
        }

        try (
            Connection c = db();

            PreparedStatement p = c.prepareStatement(
                "INSERT INTO doctor_accounts " +
                "(doctor_id,email,password_hash,active) " +
                "VALUES (?,?,?,TRUE)"
            )
        ) {

            p.setLong(1, doctorId);
            p.setString(2, email);
            p.setString(3, hashPassword(password));

            p.executeUpdate();

            send(
                e,
                201,
                "{\"message\":\"Doctor account created\"}"
            );

        } catch (SQLException ex) {

            if ("23505".equals(ex.getSQLState())) {

                throw new ApiError(
                    409,
                    "Doctor already has an account or email is used"
                );
            }

            if ("23503".equals(ex.getSQLState())) {

                throw new ApiError(
                    404,
                    "Doctor not found"
                );
            }

            throw ex;
        }
    }

    // ============================================
    // RESET DOCTOR PASSWORD
    // ============================================

    private static void adminResetDoctorPassword(
        HttpExchange e
    ) throws Exception {

        requireMethod(e, "POST");

        adminAuth(e);

        Map<String, String> m = form(e);

        long doctorId = requiredDoctorId(m);

        String password = m.getOrDefault("password", "");

        if (!strongAdminPassword(password)) {

            throw new ApiError(
                400,
                "Password needs 12+ characters, uppercase, " +
                "lowercase, number and special character"
            );
        }

        try (Connection c = db()) {

            c.setAutoCommit(false);

            try {

                // Update doctor password

                try (
                    PreparedStatement p = c.prepareStatement(
                        "UPDATE doctor_accounts " +
                        "SET password_hash=? WHERE doctor_id=?"
                    )
                ) {

                    p.setString(
                        1,
                        hashPassword(password)
                    );

                    p.setLong(2, doctorId);

                    if (p.executeUpdate() == 0) {

                        throw new ApiError(
                            404,
                            "Doctor login account not found"
                        );
                    }
                }

                // Remove old doctor sessions

                try (
                    PreparedStatement p = c.prepareStatement(
                        "DELETE FROM doctor_sessions " +
                        "WHERE doctor_id=?"
                    )
                ) {

                    p.setLong(1, doctorId);
                    p.executeUpdate();
                }

                c.commit();

            } catch (Exception ex) {

                c.rollback();
                throw ex;
            }
        }

        send(
            e,
            200,
            "{\"message\":\"Password reset; old sessions revoked\"}"
        );
    }

    // ============================================
    // ACTIVATE OR DISABLE DOCTOR ACCOUNT
    // ============================================

    private static void adminSetDoctorActive(
        HttpExchange e
    ) throws Exception {

        requireMethod(e, "POST");

        adminAuth(e);

        Map<String, String> m = form(e);

        long doctorId = requiredDoctorId(m);

        String activeValue = val(m, "active");

        if (
            !activeValue.equals("true") &&
            !activeValue.equals("false")
        ) {

            throw new ApiError(
                400,
                "Active must be true or false"
            );
        }

        boolean active = Boolean.parseBoolean(
            activeValue
        );

        try (Connection c = db()) {

            c.setAutoCommit(false);

            try {

                // Update doctor account status

                try (
                    PreparedStatement p = c.prepareStatement(
                        "UPDATE doctor_accounts " +
                        "SET active=? WHERE doctor_id=?"
                    )
                ) {

                    p.setBoolean(1, active);
                    p.setLong(2, doctorId);

                    if (p.executeUpdate() == 0) {

                        throw new ApiError(
                            404,
                            "Doctor login account not found"
                        );
                    }
                }

                // Remove sessions if account disabled

                if (!active) {

                    try (
                        PreparedStatement p = c.prepareStatement(
                            "DELETE FROM doctor_sessions " +
                            "WHERE doctor_id=?"
                        )
                    ) {

                        p.setLong(1, doctorId);
                        p.executeUpdate();
                    }
                }

                c.commit();

            } catch (Exception ex) {

                c.rollback();
                throw ex;
            }
        }

        send(
            e,
            200,
            "{\"message\":\"Doctor account updated\"}"
        );
    }

    // ============================================
    // END OF MEDICONNECT SERVER
    // ============================================

}

