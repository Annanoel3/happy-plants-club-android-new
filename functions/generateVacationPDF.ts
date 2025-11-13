import { base44 } from '@/api/base44Client';
import { jsPDF } from 'npm:jspdf@2.5.1';

export async function generateVacationPDF({ vacation_id }) {
    try {
        const user = await base44.auth.me();

        if (!user) {
            throw new Error('User not authenticated');
        }

        const vacations = await base44.entities.VacationDay.filter({ id: vacation_id });
        if (vacations.length === 0) {
            throw new Error('Vacation not found');
        }

        const vacation = vacations[0];
        const startDate = new Date(vacation.start_date);
        const endDate = new Date(vacation.end_date);
        const plantNotes = vacation.plant_notes || {};

        // Get all plants
        const plants = await base44.entities.Plant.filter({ created_by: user.email });

        // Calculate which plants need watering during vacation
        const plantsNeedingCare = [];
        
        for (const plant of plants) {
            if (!plant.water_frequency_days || plant.water_frequency_days <= 0) continue;
            
            // FIXED: Start from the plant's current next_watering_due date
            // This is the most accurate since it reflects when the plant was last watered
            let currentDate = plant.next_watering_due 
                ? new Date(plant.next_watering_due)
                : new Date(plant.last_watered || startDate);
            
            // Move forward from the next_watering_due until we reach or pass the vacation start
            while (currentDate < startDate) {
                currentDate = new Date(currentDate.getTime() + (plant.water_frequency_days * 24 * 60 * 60 * 1000));
            }
            
            // Now collect all watering dates during vacation
            const wateringDates = [];
            while (currentDate <= endDate) {
                wateringDates.push(new Date(currentDate));
                currentDate = new Date(currentDate.getTime() + (plant.water_frequency_days * 24 * 60 * 60 * 1000));
            }
            
            if (wateringDates.length > 0) {
                plantsNeedingCare.push({
                    ...plant,
                    watering_dates: wateringDates,
                    watering_date: wateringDates[0], // First watering date for sorting
                    custom_note: plantNotes[plant.id] || ""
                });
            }
        }

        plantsNeedingCare.sort((a, b) => a.watering_date - b.watering_date);

        // Create PDF
        const doc = new jsPDF();
        let y = 20;

        // Title
        doc.setFontSize(24);
        doc.setTextColor(34, 139, 34);
        doc.text('Plant Care Guide', 105, y, { align: 'center' });
        y += 10;

        doc.setFontSize(12);
        doc.setTextColor(100, 100, 100);
        doc.text(`${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`, 105, y, { align: 'center' });
        y += 15;

        if (vacation.notes) {
            doc.setFontSize(10);
            doc.setTextColor(60, 60, 60);
            doc.setFont(undefined, 'bold');
            doc.text('Plant Care Notes:', 20, y);
            y += 5;
            doc.setFont(undefined, 'normal');
            const notesLines = doc.splitTextToSize(vacation.notes, 170);
            doc.text(notesLines, 20, y);
            y += notesLines.length * 5 + 5;
        }

        if (vacation.custom_instructions) {
            doc.setFontSize(10);
            doc.setTextColor(60, 60, 60);
            doc.setFont(undefined, 'bold');
            doc.text('Other Instructions:', 20, y);
            y += 5;
            doc.setFont(undefined, 'normal');
            const instructionsLines = doc.splitTextToSize(vacation.custom_instructions, 170);
            doc.text(instructionsLines, 20, y);
            y += instructionsLines.length * 5 + 5;
        }

        doc.setDrawColor(200, 200, 200);
        doc.line(20, y, 190, y);
        y += 10;

        // Group plants by date - now handling multiple dates per plant
        const plantsByDate = {};
        for (const plant of plantsNeedingCare) {
            for (const date of plant.watering_dates) {
                const dateKey = date.toLocaleDateString();
                if (!plantsByDate[dateKey]) {
                    plantsByDate[dateKey] = [];
                }
                // Only add if not already in this date's list
                if (!plantsByDate[dateKey].find(p => p.id === plant.id)) {
                    plantsByDate[dateKey].push(plant);
                }
            }
        }

        // Process each date
        for (const [date, dayPlants] of Object.entries(plantsByDate)) {
            if (y > 250) {
                doc.addPage();
                y = 20;
            }

            // Date header
            doc.setFillColor(34, 139, 34);
            doc.rect(20, y - 5, 170, 10, 'F');
            doc.setFontSize(12);
            doc.setTextColor(255, 255, 255);
            doc.text(date, 25, y + 2);
            y += 12;

            // Grid layout
            let col = 0;
            const colWidth = 85;
            const rowHeight = 90;
            let rowStartY = y;

            for (const plant of dayPlants) {
                if (y > 220) {
                    doc.addPage();
                    y = 20;
                    rowStartY = y;
                    col = 0;
                }

                const xPos = 20 + (col * colWidth);
                let cardY = rowStartY;

                // Card border
                doc.setDrawColor(220, 220, 220);
                doc.setLineWidth(0.5);
                doc.roundedRect(xPos, cardY, colWidth - 5, rowHeight, 3, 3);

                // Plant image placeholder (simpler approach)
                doc.setFillColor(240, 240, 240);
                doc.rect(xPos + 5, cardY + 5, 30, 30, 'F');
                doc.setDrawColor(200, 200, 200);
                doc.rect(xPos + 5, cardY + 5, 30, 30);
                
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                const plantEmoji = '🌱';
                doc.text(plantEmoji, xPos + 15, cardY + 23);

                // Plant name
                doc.setFontSize(11);
                doc.setTextColor(0, 0, 0);
                doc.setFont(undefined, 'bold');
                const displayName = plant.nickname || plant.name;
                const nameLines = doc.splitTextToSize(displayName, colWidth - 45);
                doc.text(nameLines, xPos + 38, cardY + 10);
                doc.setFont(undefined, 'normal');

                cardY += 15;

                // Show watering frequency if multiple times
                if (plant.watering_dates.length > 1) {
                    doc.setFontSize(7);
                    doc.setTextColor(100, 100, 200);
                    doc.text(`(Waters ${plant.watering_dates.length}x during trip)`, xPos + 5, cardY);
                    cardY += 4;
                }

                // Details
                doc.setFontSize(8);
                doc.setTextColor(100, 100, 100);
                if (plant.environment) {
                    doc.text(`Location: ${plant.environment}`, xPos + 5, cardY);
                    cardY += 4;
                }
                if (plant.location) {
                    const locationText = `Spot: ${plant.location}`;
                    const locationLines = doc.splitTextToSize(locationText, colWidth - 10);
                    doc.text(locationLines, xPos + 5, cardY);
                    cardY += locationLines.length * 4;
                }

                // Custom note for this plant
                if (plant.custom_note) {
                    cardY += 2;
                    doc.setTextColor(0, 100, 0);
                    doc.setFont(undefined, 'bold');
                    doc.text('Note:', xPos + 5, cardY);
                    doc.setFont(undefined, 'normal');
                    cardY += 4;
                    doc.setTextColor(60, 60, 60);
                    const noteLines = doc.splitTextToSize(plant.custom_note, colWidth - 10);
                    doc.text(noteLines.slice(0, 2), xPos + 5, cardY);
                    cardY += noteLines.slice(0, 2).length * 4;
                }

                cardY += 2;
                doc.setFontSize(8);
                doc.setTextColor(0, 100, 200);
                doc.setFont(undefined, 'bold');
                doc.text('Watering:', xPos + 5, cardY);
                doc.setFont(undefined, 'normal');
                cardY += 4;
                
                doc.setTextColor(60, 60, 60);
                if (plant.care_instructions?.watering) {
                    const waterText = plant.care_instructions.watering.substring(0, 80);
                    const waterLines = doc.splitTextToSize(waterText, colWidth - 10);
                    doc.text(waterLines.slice(0, 2), xPos + 5, cardY);
                } else {
                    doc.text('Water as needed', xPos + 5, cardY);
                }

                col++;
                if (col >= 2) {
                    col = 0;
                    y = rowStartY + rowHeight + 5;
                    rowStartY = y;
                }
            }

            if (col === 1) {
                y = rowStartY + rowHeight + 5;
            }

            y += 5;
        }

        // Summary page
        doc.addPage();
        y = 20;
        
        doc.setFontSize(20);
        doc.setTextColor(34, 139, 34);
        doc.text('Quick Reference', 105, y, { align: 'center' });
        y += 15;

        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.text(`Total plants needing water: ${plantsNeedingCare.length}`, 20, y);
        y += 7;
        doc.text(`Vacation duration: ${Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))} days`, 20, y);
        y += 12;

        doc.setDrawColor(200, 200, 200);
        doc.line(20, y, 190, y);
        y += 10;

        doc.setFontSize(14);
        doc.setTextColor(34, 139, 34);
        doc.text('All Plants Checklist:', 20, y);
        y += 8;

        // Checklist
        let checklistCol = 0;
        const checklistColWidth = 85;
        let checklistY = y;

        for (const plant of plants) {
            if (checklistY > 270) {
                doc.addPage();
                checklistY = 20;
                checklistCol = 0;
            }

            const xPos = 20 + (checklistCol * checklistColWidth);
            
            doc.setFontSize(9);
            doc.setTextColor(0, 0, 0);
            doc.rect(xPos, checklistY - 3, 4, 4);
            
            const needsCare = plantsNeedingCare.find(p => p.id === plant.id);
            if (needsCare) {
                doc.setTextColor(0, 100, 200);
            } else {
                doc.setTextColor(100, 100, 100);
            }
            
            const displayName = plant.nickname || plant.name;
            const nameText = doc.splitTextToSize(displayName, checklistColWidth - 10);
            doc.text(nameText[0], xPos + 6, checklistY);
            
            checklistCol++;
            if (checklistCol >= 2) {
                checklistCol = 0;
                checklistY += 6;
            }
        }

        // Return the PDF as ArrayBuffer
        return doc.output('arraybuffer');
    } catch (error) {
        console.error('PDF Error:', error);
        throw error;
    }
}