import os

import win32com.client as win32


def test_metadata():
    word = win32.Dispatch("Word.Application")
    word.Visible = False
    doc_path = os.path.abspath("dummy.docx")
    if not os.path.exists(doc_path):
        doc = word.Documents.Add()
        doc.SaveAs(doc_path)
        doc.Close()

    doc = word.Documents.Open(doc_path)
    try:
        edit_time = doc.BuiltInDocumentProperties("Total editing time").Value
        rev_count = doc.BuiltInDocumentProperties("Revision number").Value
        words = doc.BuiltInDocumentProperties("Number of words").Value
        print(f"Edit time: {edit_time}, Rev count: {rev_count}, Words: {words}")
    except Exception as e:
        print(e)
    finally:
        doc.Close(SaveChanges=False)
        word.Quit()

if __name__ == "__main__":
    test_metadata()
