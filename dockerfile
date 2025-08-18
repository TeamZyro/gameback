# Use official Node.js LTS image as base
FROM node:20

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json if available
COPY package*.json ./

# Install npm packages
RUN npm install

# Copy the rest of the application code
COPY . .

# Set the default command to run your app
CMD ["npm", "run", "start"]
