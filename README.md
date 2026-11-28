q# Warehouse Inventory and Stock Movement System

## 1. Project Overview

The **Warehouse Inventory and Stock Movement System** is a full-stack web application designed to simplify and manage inventory operations across multiple warehouses.

The system helps organizations maintain accurate stock records, manage incoming and outgoing inventory, transfer items between warehouses, and monitor available stock levels through a centralized platform.

It provides an organized interface for managing warehouse operations while ensuring that inventory movements are recorded and stock balances are updated consistently.

## 2. Objectives

- Centralize inventory management across multiple warehouses.
- Maintain accurate records of items and warehouse details.
- Track stock receipts and stock issues.
- Manage stock transfers between warehouses.
- Monitor real-time inventory balances.
- Reduce manual errors in inventory tracking.
- Provide a user-friendly interface for efficient stock management.

## 3. Key Features

### Dashboard
- Provides an overview of inventory operations.
- Displays important inventory information and stock summaries.

### Item Management
- Add, view, update, and manage inventory items.
- Maintain item codes, names, categories, units, and reorder levels.
- Track active and inactive items.

### Warehouse Management
- Add and manage multiple warehouses.
- Maintain warehouse codes, names, and locations.
- View warehouse information in one place.

### Stock Receipt Management
- Record incoming stock received at warehouses.
- Maintain receipt numbers, item details, quantities, and receipt dates.
- Update inventory through recorded receipts.

### Stock Issue Management
- Record items issued from warehouses.
- Maintain issue numbers, quantities, and issue dates.
- Validate stock availability before issuing items.

### Stock Transfer Management
- Transfer inventory from one warehouse to another.
- Maintain source and destination warehouse details.
- Record transfer quantities, dates, and status.
- Ensure stock movements are properly tracked.

### Stock Balance Management
- View available inventory quantities.
- Monitor stock balances across warehouses.
- Filter inventory balances by warehouse.
- Identify items that require restocking based on reorder levels.

## 4. Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | Angular, TypeScript, HTML, CSS, Bootstrap |
| Backend | Java 21, Spring Boot |
| Database | MySQL |
| API Communication | REST APIs, JSON |
| Backend Data Access | Spring Data JPA |
| API Testing | Postman |
| Development Tools | Visual Studio Code, Git, GitHub |

## 5. System Architecture

The application follows a three-layer architecture:

**Frontend Layer**
- Developed using Angular.
- Provides the user interface for inventory operations.
- Communicates with the backend using HTTP requests.

**Backend Layer**
- Developed using Java and Spring Boot.
- Exposes RESTful APIs.
- Handles business logic, validations, and inventory operations.
- Uses Spring Data JPA to interact with the database.

**Database Layer**
- Uses MySQL for persistent data storage.
- Stores item, warehouse, receipt, issue, transfer, and inventory-related information.

### Application Flow

User → Angular Frontend → Spring Boot REST APIs → Spring Data JPA → MySQL Database

The backend processes requests and returns responses in JSON format to the frontend.

## 6. Project Structure

```text
warehouse-inventory-system/
│
├── frontend/
│   ├── src/
│   │   └── app/
│   │       ├── components/
│   │       │   ├── dashboard/
│   │       │   ├── items/
│   │       │   ├── warehouses/
│   │       │   ├── receipts/
│   │       │   ├── issues/
│   │       │   ├── transfers/
│   │       │   └── balances/
│   │       │
│   │       ├── services/
│   │       ├── models/
│   │       └── app.routes.ts
│   │
│   └── package.json
│
├── backend/
│   └── Spring Boot application
│
├── database/
│   └── Database scripts
│
└── README.md
```

## 7. Modules and Inventory Operations

The system supports the following major inventory operations:

| Module | Operation |
|---|---|
| Items | Create, view, update, and manage items |
| Warehouses | Create and manage warehouse details |
| Stock Receipts | Record incoming inventory |
| Stock Issues | Record outgoing inventory |
| Stock Transfers | Move inventory between warehouses |
| Stock Balances | View available stock quantities |

## 8. API Endpoints

The backend exposes REST APIs under the following base URL:

```text
http://localhost:8080/api
```

| Module | Endpoint |
|---|---|
| Items | `/items` |
| Warehouses | `/warehouses` |
| Stock Receipts | `/stock-receipts` |
| Stock Issues | `/stock-issues` |
| Stock Transfers | `/stock-transfers` |
| Stock Balances | `/inventory/balances` |

The application uses HTTP methods such as GET, POST, PUT, and DELETE according to the operations supported by each module.

## 9. Installation and Setup

### Prerequisites

Make sure the following software is installed:

- Node.js and npm
- Angular CLI
- Java Development Kit (JDK 21)
- MySQL Server
- Visual Studio Code or another suitable IDE
- Git

### Step 1: Clone the Repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd warehouse-inventory-system
```

### Step 2: Set Up the Database

1. Start your MySQL server.
2. Create the required database.
3. Execute the SQL scripts available in the `database/` directory, if provided.
4. Configure the database URL, username, and password in the backend application configuration.

### Step 3: Run the Backend

Navigate to the backend directory:

```bash
cd backend
```

Configure the MySQL connection details in the application's configuration file.

Run the Spring Boot application using the Maven wrapper:

```bash
./mvnw spring-boot:run
```

On Windows, use:

```powershell
.\mvnw.cmd spring-boot:run
```

The backend runs on:

```text
http://localhost:8080
```

### Step 4: Run the Frontend

Open a new terminal and navigate to the frontend directory:

```bash
cd frontend
```

Install the required dependencies:

```bash
npm install
```

Start the Angular development server:

```bash
ng serve
```

The frontend runs on:

```text
http://localhost:4200
```

Open the URL in your browser to access the application.

## 10. Inventory Management Workflow

A typical inventory workflow in the application is:

1. Add items to the inventory system.
2. Register the warehouses where inventory will be stored.
3. Record stock receipts when new items arrive.
4. Record stock issues when items are dispatched.
5. Transfer stock between warehouses when required.
6. Monitor stock balances to track available quantities.
7. Review stock levels against reorder levels to identify replenishment requirements.

## 11. Validation and Data Management

The application supports inventory-related validations to maintain data consistency.

Examples include:

- Validating item and warehouse information.
- Ensuring that stock quantities are positive.
- Checking stock availability before issuing items.
- Preventing transfers when sufficient stock is unavailable.
- Maintaining source and destination warehouse information for transfers.
- Updating inventory balances based on stock movements.

## 12. Future Enhancements

Possible future improvements include:

- Role-based authentication and authorization.
- Advanced inventory analytics and reporting.
- Low-stock notifications and automated alerts.
- Exporting inventory reports to Excel or PDF.
- Barcode and QR code-based inventory tracking.
- Audit logs for inventory transactions.

## 13. Conclusion

The Warehouse Inventory and Stock Movement System provides a centralized solution for managing inventory across multiple warehouses.

By integrating an Angular frontend, a Spring Boot backend, and a MySQL database, the application simplifies stock management, improves inventory visibility, and supports organized tracking of receipts, issues, transfers, and stock balances.

The project demonstrates the practical application of full-stack web development, REST API integration, database management, and software engineering concepts.

---

**Project:** Warehouse Inventory and Stock Movement System  
**Project Type:** Full-Stack Web Application  
**Frontend:** Angular  
**Backend:** Java Spring Boot  
**Database:** MySQL
