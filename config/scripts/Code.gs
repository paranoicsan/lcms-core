// default page width (letter size with 1in margins),
// content will be export to this width and need to be adjusted
var GOOGLE_PAGE_WIDTH = 468;
// for conversion, 1 Pixel [px] = 0.75 Point [pt]
var PX_TO_PT = 0.75;
// margin for positioned images, setting it as 0 to align images to the right as we can't set margins for images now
// due to the lack of support for this in html/app script/docs api
var IMAGE_MARGIN = 0;
// default font size for elements we're copying
var DEFAULT_FONT_SIZE = 10;
// tags
var RE_SIZE = /\[(?:\d+)\]/;

function getParentWidth(parent, defaultWidth) {
  if (parent.getType() == DocumentApp.ElementType.TABLE_CELL) {
    parent = parent.asTableCell();
    let parentWidth = parent.getWidth();
    // if cell is merged from several cells, then we need to calculate the width of all siblings to get the real width
    // otherwise we will get the width of the first cell only
    if (parent.getColSpan() > 1) {
      let colSpan = parent.getColSpan() - 1; // Number of siblings to include
      let nextSibling = parent.getNextSibling();
      while (nextSibling && colSpan > 0) {
        parentWidth += nextSibling.getWidth(); // Add the sibling's width
        nextSibling = nextSibling.getNextSibling(); // Move to the next sibling
        colSpan--; // Decrease the remaining siblings to process
      }
    }
    return parentWidth - parent.getPaddingLeft() - parent.getPaddingRight();
  }
  return defaultWidth;
}

/**
 * Copy elements to new doc
 */
function appendElementToDoc(document, element) {
  var tName = underscoreToCamelCase(element.getType() + '');
  try {
    document['append' + tName](element);
  } catch (err) {
    Logger.log(err + '');
  }
  return document;
}

/**
 * Transform typename to function name
 */
function underscoreToCamelCase(type) {
  type = type.toLowerCase();
  var tName = type.charAt(0).toUpperCase() + type.slice(1);
  var parts = tName.split('_');
  if (parts.length == 2) {
    tName = parts[0] + parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
  }
  return tName;
}

/**
 * Update inlined images
 */
function updateInlinedImages(body, documentWidth) {
  var images = body.getImages();

  for (var i = 0; i < images.length; i++) {
    var img = images[i];
    var parent = img.getParent().getParent();
    var altDescription = img.getAltDescription();
    // check if this is our image, should contain [size] as description
    if (!RE_SIZE.test(altDescription)) continue;
    var parentWidth = getParentWidth(parent, documentWidth);
    var previousWidth = img.getWidth();
    var previousHeight = img.getHeight();
    var newWidth = parentWidth / PX_TO_PT;
    var newHeight = previousHeight * (newWidth / previousWidth);
    img.setWidth(newWidth);
    img.setHeight(newHeight);
    // remove service information from alt description
    img.setAltDescription(altDescription.replace(RE_SIZE, '').trim());
  }
}

/**
 * Update positioned images
 */
function updatePositionedImages(body, documentWidth) {
  var paragraphs = body.getParagraphs();

  for (var childIndex = 0; childIndex < paragraphs.length; childIndex++) {
    var child = paragraphs[childIndex];
    // Collect images from current container
    var images = child.getPositionedImages();
    var parent = child.getParent();
    var parentWidth = 0;
    var newCommulativeWidth = 0;
    var newCommulativeHeight = 0;
    for (var i = 0; i < images.length; i++) {
      var img = images[i];
      var previousWidth = img.getWidth();
      var previousHeight = img.getHeight();
      // there is no way to get alt description or another information for the images
      // we're doing an assumption that we need to adjust only images with width < 100
      if (previousWidth >= 100) continue;
      // not process images if connected paragraph contains $IMG
      if (child.getText().includes('$IMG')) {
        child.replaceText('\\$IMG', '');
        continue;
      }
      // value in pt
      parentWidth = parentWidth || getParentWidth(parent, documentWidth);
      // need value in px, previousWidth is number of percent from parent
      var newWidth = ((parentWidth / PX_TO_PT) * previousWidth) / 100;
      var newHeight = previousHeight * (newWidth / previousWidth);
      img = img.setWidth(newWidth);
      img = img.setHeight(newHeight);
      img = img.setTopOffset(newCommulativeHeight);
      newCommulativeHeight += newHeight;
      newCommulativeWidth += newWidth + IMAGE_MARGIN;
      var offset = img.getLeftOffset();
      // if offset is 0, then image is aligned to the left and we don't need to adjust it
      if (offset !== 0) {
        img.setLeftOffset(parentWidth - newCommulativeWidth * PX_TO_PT);
      }
    }
  }
}

function updateParagraphStyles(elementFrom, elementTo) {
  // adjust font size for first&last paragraphs
  var tmplParagraphs = elementFrom.getParagraphs();
  var documentParagraphs = elementTo.getParagraphs();
  if (tmplParagraphs && documentParagraphs) {
    var diff = documentParagraphs.length - tmplParagraphs.length;
    for (var i = 0; i < diff; i++) {
      documentParagraphs[i].removeFromParent();
    }
    tmplParagraphs.forEach(function (el, idx) {
      if (idx < documentParagraphs.length) {
        var tmplParagraph = tmplParagraphs[idx];
        var documentParagraph = documentParagraphs[idx + diff];
        if (!documentParagraph) return;
        var styles = {};
        var attrs = tmplParagraph.getAttributes();
        // set font size from template or if it's not set, then set DEFAULT_FONT_SIZE unless paragraph contains RE_SIZE
        var fontSize = attrs[DocumentApp.Attribute.FONT_SIZE];
        var text = documentParagraph.getText();
        if (RE_SIZE.test(text)) {
          // get font size from RE_SIZE (e.g. for [12] take 12)
          fontSize = parseInt(text.match(RE_SIZE)[0].replace(/\D/g, ''));
          // remove [font size] from documentParagraph
          documentParagraph.replaceText('\\[.*\\]', '');
        }
        styles[DocumentApp.Attribute.FONT_SIZE] = fontSize || DEFAULT_FONT_SIZE;
        styles[DocumentApp.Attribute.LINE_SPACING] = attrs[DocumentApp.Attribute.LINE_SPACING];
        styles[DocumentApp.Attribute.FONT_FAMILY] =
          attrs[DocumentApp.Attribute.FONT_FAMILY] || 'Montserrat';
        documentParagraph.setAttributes(styles);
      }
    });
  }
}

/**
 * Copy content (in use for copy header/footer from template)
 */
function copyContentTo(
  document,
  template,
  isLandscape,
  elementFrom,
  elementTo,
  patterns,
  replaceTexts,
  gradeColors = []
) {
  elementTo.clear();
  var tmplTable = elementFrom.getTables()[0];
  if (!tmplTable)
    return copyParagraphsTo(document, template, elementFrom, elementTo, patterns, replaceTexts);
  var table = elementTo.appendTable(tmplTable.copy());
  for (var i = 0; i < tmplTable.getNumChildren(); i++) {
    appendElementToDoc(table, tmplTable.getChild(i).copy());
  }
  table.removeRow(0);
  for (var i = 0; i < patterns.length; i++) {
    table.replaceText(patterns[i], replaceTexts[i]);
  }

  // adjust for different margins
  var documentWidth =
    document.getPageWidth() - document.getMarginLeft() - document.getMarginRight();
  var templateWidth = template.getPageWidth();
  var templateHeight = template.getPageHeight();
  // need to check this because of mess with width/height templates
  if (
    (isLandscape && templateHeight > templateWidth) ||
    (!isLandscape && templateWidth > templateHeight)
  ) {
    templateWidth = templateHeight - template.getMarginTop() - template.getMarginBottom();
  } else {
    templateWidth = templateWidth - template.getMarginLeft() - template.getMarginRight();
  }
  var ratio = documentWidth / templateWidth;

  table = elementTo.getTables()[0];
  var firstRow = table.getRow(0);
  var numCells = firstRow.getNumChildren();
  for (var iCell = 0; iCell < numCells; iCell++) {
    var cell = firstRow.getChild(iCell).asTableCell();
    cell.setWidth(cell.getWidth() * ratio);
  }

  updateParagraphStyles(elementFrom, elementTo);

  if (gradeColors.length) {
    // Get the first cell in the first row
    var cell = firstRow.getChild(0).asTableCell();
    // Set the background color to yellow
    cell.setBackgroundColor(gradeColors[0]);
    var text = cell.editAsText();
    text.setForegroundColor(gradeColors[1]);
  }
}

/**
 * Copy paragrphs, not tables
 */
function copyParagraphsTo(document, template, elementFrom, elementTo, patterns, replaceTexts) {
  var tmplParagraphs = elementFrom.getParagraphs();
  for (var i = 0; i < tmplParagraphs.length; i++) {
    elementTo.appendParagraph(tmplParagraphs[i].copy());
  }
  for (var i = 0; i < patterns.length; i++) {
    elementTo.replaceText(patterns[i], replaceTexts[i]);
  }

  updateParagraphStyles(elementFrom, elementTo);
}

/**
 * Copy footer from template
 */
function copyFooter(document, template, isLandscape, patterns, replaceTexts) {
  var tmplFooter = template.getFooter();
  if (!tmplFooter || !tmplFooter.getTables()) return;
  var footer = document.getFooter() || document.addFooter();
  copyContentTo(document, template, isLandscape, tmplFooter, footer, patterns, replaceTexts);
}

/**
 * Copy header from template
 */
function copyHeader(document, template, isLandscape, patterns, replaceTexts, gradeColors) {
  var tmplHeader = template.getHeader();
  if (!tmplHeader || !tmplHeader.getTables()) return;
  var header = document.getHeader() || document.addHeader();
  copyContentTo(
    document,
    template,
    isLandscape,
    tmplHeader,
    header,
    patterns,
    replaceTexts,
    gradeColors
  );
}

/**
 * Set margins and page width/height from template
 */
function setMargins(document, template, isLandscape = false) {
  var templateWidth = template.getPageWidth();
  var templateHeight = template.getPageHeight();
  if (
    (isLandscape && templateHeight > templateWidth) ||
    (!isLandscape && templateWidth > templateHeight)
  ) {
    document.setPageHeight(templateWidth);
    document.setPageWidth(templateHeight);
  } else {
    document.setPageHeight(templateHeight);
    document.setPageWidth(templateWidth);
  }
  var documentWidth =
    document.getPageWidth() - document.getMarginLeft() - document.getMarginRight();
  var body = document.getBody();
  updateInlinedImages(body, documentWidth);
  // we support left/right alignment and no restriction on image size
  updatePositionedImages(body, documentWidth);
}

/**
 * Returns the Text element with page-break placeholder
 */
function findBreak(body) {
  var el = body.findText('--GDOC-PAGE-BREAK--');
  return el ? el.getElement() : null;
}

/**
 * Inserts page-breaks instead of placeholders
 */
function processPageBreaks(document) {
  var body = document.getBody();

  var breakElement = findBreak(body);
  while (breakElement) {
    var breakParent = breakElement.getParent();
    var index = breakParent.getChildIndex(breakElement);

    try {
      breakParent.insertPageBreak(index);

      const style = {};
      style[DocumentApp.Attribute.LINE_SPACING] = 0.1;
      style[DocumentApp.Attribute.SPACING_AFTER] = 0;
      style[DocumentApp.Attribute.SPACING_BEFORE] = 0;
      style[DocumentApp.Attribute.FONT_SIZE] = 1;

      breakParent.setAttributes(style);
    } catch (err) {
      Logger.log(err);
    } finally {
      breakElement.removeFromParent();
    }

    breakElement = findBreak(body);
  }
}

/**
 * Main function to call after uploading document
 */
function postProcessing(
  documentId,
  templateId,
  isLandscape = false,
  footerPatterns = [],
  footerReplaceTexts = [],
  headerPatterns = [],
  headerReplaceTexts = [],
  gradeColors = []
) {
  var document = DocumentApp.openById(documentId);
  var template = DocumentApp.openById(templateId);
  processPageBreaks(document);
  setMargins(document, template, isLandscape);
  if (footerPatterns.length && footerReplaceTexts.length)
    copyFooter(document, template, isLandscape, footerPatterns, footerReplaceTexts);
  if (headerPatterns.length && headerReplaceTexts.length)
    copyHeader(document, template, isLandscape, headerPatterns, headerReplaceTexts, gradeColors);
}
