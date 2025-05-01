import os
import json

def build_scad_tree(path):
    entries = []
    for item in sorted(os.listdir(path)):
        full_path = os.path.join(path, item)
        if os.path.isdir(full_path):
            # Recurse into subdirectory
            entries.append([item, build_scad_tree(full_path)])
        elif item.endswith('.scad'):
            # Add .scad file
            entries.append(item)
    return entries

if __name__ == '__main__':
    root = 'public/SFLibs'
    tree = build_scad_tree(root)
    output_path = os.path.join(root, 'catalog.json')
    with open(output_path, 'w') as f:
        json.dump(tree, f, indent=2)
